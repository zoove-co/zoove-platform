import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { EmailProvider, type EmailMessage } from '../src/email/email.provider';
import { DispatchService } from '../src/bookings/dispatch.service';
import { TrainerReminderService } from '../src/bookings/trainer-reminder.service';
import { OutboxWorkerService } from '../src/notifications/outbox-worker.service';
import { CODE, signIn, startApp } from './helpers';

class MemoryEmail extends EmailProvider {
  sent: EmailMessage[] = [];
  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}
const mail = new MemoryEmail();
process.env.OPS_NOTIFY_EMAILS = 'ops@zoove.test';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const OWNER = 'owner-jobs@zoove.test';
const ME = '+919876543210';
const FRIEND = '+919812345678';
const T1 = '+919800000001';
const T2 = '+919800000002';
const OUTSIDER = '+919800000009';
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number, hour = 18) => new Date(`${isoDate(days)}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString();

suite('trainer jobs: who is free, assigning, open jobs, accepting and cancelling', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let owner: string;
  let me: string;
  let friend: string;
  let t1: string;
  let t2: string;
  let t1Id: string;
  let t2Id: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = () => `job-key-${Date.now()}-${(n += 1)}`;
  const worker = () => app.get(OutboxWorkerService);
  // Open sessions are offered to trainers by the dispatcher (a timer in production); tests run it by hand.
  const dispatch = () => app.get(DispatchService).runOnce();
  async function adminToken(email: string) {
    const user = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [email]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [user.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner, permissions) values ($1, 'Ritesh', 'Team', true, '{}')`, [user.rows[0]!.id]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    return (await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  }
  async function trainer(phone: string, first: string, email: string): Promise<{ token: string; id: string }> {
    const token = await signIn(app, pool, phone);
    const id = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [phone])).rows[0]!.id;
    await pool.query(`update users set verified_email = $2 where id = $1`, [id, email]);
    const appId = await pool.query<{ id: string }>(`insert into trainer_applications (id, user_id, status, first_name, last_name) values (gen_random_uuid(), $1, 'approved', $2, 'Rao') returning id`, [id, first]);
    await pool.query(`insert into trainers (user_id, application_id) values ($1, $2)`, [id, appId.rows[0]!.id]);
    return { token, id };
  }
  async function addressFor(t: string) {
    return (await http().post('/v1/addresses').set(as(t)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
  }
  const book = (t: string, addressId: string, startsAt: string) =>
    http().post('/v1/bookings').set(as(t)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId, startsAt, idempotencyKey: key() });
  const bookingId = async (t: string, addressId: string, startsAt: string) => {
    const id = (await book(t, addressId, startsAt).expect(201)).body.id as string;
    await dispatch();
    return id;
  };
  const assign = (id: string, trainerId: string) => http().post(`/v1/admin/sessions/${id}/assign`).set(as(owner)).send({ trainerId });
  const available = async (id: string) => (await http().get(`/v1/admin/sessions/${id}/available-trainers`).set(as(owner)).expect(200)).body as { id: string; name: string; sameDay: number }[];
  const board = async (t: string) => (await dispatch(), await http().get('/v1/trainer/jobs').set(as(t)).expect(200)).body as { open: { id: string }[]; mine: { id: string; addressLine: string; customerFirstName: string; canCancel: boolean; note: string }[]; done: { id: string; note: string }[]; doneCount: number };

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) => builder.overrideProvider(EmailProvider).useValue(mail)));
    await pool.query(`update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar'`);
  });
  afterAll(async () => {
    await pool.query(`update clusters set status = 'locked', activated_at = null where slug = 'bandra-khar'`);
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query('truncate table referral_rewards, referrals, referral_codes, discount_attempts, discount_redemptions, discount_codes, booking_events, customer_notifications, bookings, trainers, trainer_application_events, trainer_documents, trainer_applications, otp_challenges, refresh_tokens, admin_profiles, user_roles, users, outbox_events, audit_log cascade');
    me = await signIn(app, pool, ME);
    friend = await signIn(app, pool, FRIEND);
    owner = await adminToken(OWNER);
    ({ token: t1, id: t1Id } = await trainer(T1, 'Asha', 'asha@trainer.test'));
    ({ token: t2, id: t2Id } = await trainer(T2, 'Bala', 'bala@trainer.test'));
    mail.sent.length = 0;
  });

  describe('ops assigning', () => {
    it('lists only trainers who are free at that time, and not one who dropped the session', async () => {
      const when = slot(3);
      const a = await bookingId(me, await addressFor(me), when);
      const b = await bookingId(friend, await addressFor(friend), when);
      expect((await available(a)).map((t) => t.name).sort()).toEqual(['Asha Rao', 'Bala Rao']);
      await assign(a, t1Id).expect(200);
      // Asha is now busy at that time: she is not offered for the other session at the same time.
      expect((await available(b)).map((t) => t.name)).toEqual(['Bala Rao']);
      // The server also refuses her if someone picks her anyway.
      await assign(b, t1Id).expect(409);
      // A different time: she is free again, and shows she already has one that day.
      const c = await bookingId(me, await addressFor(me), slot(3, 19));
      const list = await available(c);
      expect(list.map((t) => t.name)).toEqual(['Asha Rao', 'Bala Rao']);
      expect(list.find((t) => t.id === t1Id)!.sameDay).toBe(1);
      // After Asha drops the first session she cannot be offered it again.
      await http().post('/v1/trainer/jobs/' + a + '/cancel').set(as(t1)).send({ reason: 'Not well today' }).expect(200);
      expect((await available(a)).map((t) => t.name)).toEqual(['Bala Rao']);
      // A session with a trainer, or finished, offers nobody.
      await assign(a, t2Id).expect(200);
      expect(await available(a)).toEqual([]);
    });

    it('emails the trainer when assigned, with the code, time and area but not the address', async () => {
      const id = await bookingId(me, await addressFor(me), slot(3));
      await assign(id, t2Id).expect(200);
      await worker().runOnce();
      const sent = mail.sent.filter((m) => m.to === 'bala@trainer.test');
      expect(sent).toHaveLength(1);
      expect(sent[0]!.subject).toContain('New session for you');
      expect(sent[0]!.text).toContain('Bandra West');
      expect(sent[0]!.text).toContain(`ZV-${id.replace(/-/g, '').slice(-8).toUpperCase()}`);
      expect(sent[0]!.text).not.toContain('Test Heights');
      mail.sent.length = 0;
      await worker().runOnce();
      expect(mail.sent).toHaveLength(0); // once only
    });

    it('tells a trainer by email when ops move their session', async () => {
      const id = await bookingId(me, await addressFor(me), slot(3));
      await assign(id, t1Id).expect(200);
      await worker().runOnce();
      mail.sent.length = 0;
      await http().post(`/v1/admin/sessions/${id}/reschedule`).set(as(owner)).send({ startsAt: slot(4), reason: 'Customer asked' }).expect(200);
      await worker().runOnce();
      const moved = mail.sent.filter((m) => m.to === 'asha@trainer.test');
      expect(moved).toHaveLength(1);
      expect(moved[0]!.subject).toContain('Session moved');
    });

    it('never puts one trainer on two sessions at the same time, even when assigned at the same moment', async () => {
      const when = slot(3);
      const a = await bookingId(me, await addressFor(me), when);
      const b = await bookingId(friend, await addressFor(friend), when);
      const results = await Promise.all([assign(a, t1Id), assign(b, t1Id)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await pool.query(`select count(*)::int as c from bookings where coach_id = $1 and status = 'confirmed'`, [t1Id])).rows[0].c).toBe(1);
    });
  });

  describe('trainer open jobs', () => {
    it('is only for active trainers', async () => {
      const outsider = await signIn(app, pool, OUTSIDER);
      await http().get('/v1/trainer/jobs').set(as(outsider)).expect(403);
      await http().get('/v1/trainer/jobs').set(as(me)).expect(403);
      await http().get('/v1/trainer/jobs').expect(401);
      await pool.query(`update trainers set status = 'paused' where user_id = $1`, [t1Id]);
      await http().get('/v1/trainer/jobs').set(as(t1)).expect(403);
    });

    it('shows an open job without the address or the customer, and the full details only after accepting', async () => {
      const id = await bookingId(me, await addressFor(me), slot(3));
      const open = await board(t1);
      expect(open.open.map((j) => j.id)).toEqual([id]);
      expect(JSON.stringify(open.open)).not.toContain('Test Heights');
      expect(JSON.stringify(open.open)).not.toContain(ME);
      expect(open.open[0]).toMatchObject({ area: 'Bandra West', serviceName: expect.any(String) });
      const after = (await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t1)).expect(200)).body as Awaited<ReturnType<typeof board>>;
      expect(after.open).toEqual([]);
      expect(after.mine).toHaveLength(1);
      expect(after.mine[0]!.addressLine).toContain('Test Heights');
      expect(after.mine[0]!.canCancel).toBe(true);
      // The other trainer no longer sees it, and the customer and admin see the trainer.
      expect((await board(t2)).open).toEqual([]);
      const notes = (await http().get('/v1/notifications').set(as(me)).expect(200)).body as { title: string; body: string }[];
      expect(notes.some((x) => x.title === 'Coach assigned' && x.body.includes('Asha'))).toBe(true);
      const detail = (await http().get(`/v1/admin/sessions/${id}`).set(as(owner)).expect(200)).body;
      expect(detail).toMatchObject({ status: 'confirmed', trainerId: t1Id });
      expect(detail.events.find((e: { type: string }) => e.type === 'trainer_assigned')).toMatchObject({ actor: 'trainer' });
    });

    it('first to accept gets it; the second is told someone else took it', async () => {
      const id = await bookingId(me, await addressFor(me), slot(3));
      const results = await Promise.all([http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t1)), http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t2))]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await pool.query(`select count(*)::int as c from bookings where id = $1 and status = 'confirmed' and coach_id is not null`, [id])).rows[0].c).toBe(1);
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t2)).expect(409);
    });

    it('a trainer cannot take two sessions at the same time, not even at the same moment', async () => {
      const when = slot(3);
      const a = await bookingId(me, await addressFor(me), when);
      const b = await bookingId(friend, await addressFor(friend), when);
      const results = await Promise.all([http().post(`/v1/trainer/jobs/${a}/accept`).set(as(t1)), http().post(`/v1/trainer/jobs/${b}/accept`).set(as(t1))]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      // The busy trainer no longer sees the other one; the free trainer still does.
      const mine = await board(t1);
      expect(mine.mine).toHaveLength(1);
      expect(mine.open).toEqual([]);
      expect((await board(t2)).open).toHaveLength(1);
    });

    it('does not offer a session whose time has passed', async () => {
      const id = await bookingId(me, await addressFor(me), slot(3));
      await pool.query(`update bookings set starts_at = now() - interval '1 hour' where id = $1`, [id]);
      expect((await board(t1)).open).toEqual([]);
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t1)).expect(409);
    });
  });

  describe('trainer cancelling', () => {
    it('puts the session back to open, tells the customer and ops, and the same trainer cannot pick it again', async () => {
      const id = await bookingId(me, await addressFor(me), slot(3));
      await assign(id, t1Id).expect(200);
      expect((await board(t1)).mine.map((j) => j.id)).toEqual([id]);
      await http().post(`/v1/trainer/jobs/${id}/cancel`).set(as(t1)).send({ reason: 'x' }).expect(400); // a reason is required
      const after = (await http().post(`/v1/trainer/jobs/${id}/cancel`).set(as(t1)).send({ reason: 'Family emergency' }).expect(200)).body as Awaited<ReturnType<typeof board>>;
      expect(after.mine).toEqual([]);
      expect(after.open).toEqual([]); // she dropped it, so it is not offered to her again
      expect((await board(t2)).open.map((j) => j.id)).toEqual([id]);
      const detail = (await http().get(`/v1/admin/sessions/${id}`).set(as(owner)).expect(200)).body;
      expect(detail).toMatchObject({ status: 'rematching', trainerId: null, trainerCancelCount: 1 });
      expect(detail.events.find((e: { type: string }) => e.type === 'trainer_cancelled')).toMatchObject({ actor: 'trainer' });
      const notes = (await http().get('/v1/notifications').set(as(me)).expect(200)).body as { title: string }[];
      expect(notes.some((x) => x.title === 'Your coach had to cancel')).toBe(true);
      await worker().runOnce();
      expect(mail.sent.some((m) => m.to === 'ops@zoove.test' && m.subject.includes('Trainer cancelled'))).toBe(true);
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t1)).expect(409);
      // Another trainer picks it up.
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t2)).expect(200);
    });

    it('a trainer can only cancel their own session, and not after it has started', async () => {
      const id = await bookingId(me, await addressFor(me), slot(3));
      await assign(id, t1Id).expect(200);
      await http().post(`/v1/trainer/jobs/${id}/cancel`).set(as(t2)).send({ reason: 'Not mine' }).expect(409);
      await pool.query(`update bookings set starts_at = now() - interval '5 minutes' where id = $1`, [id]);
      await http().post(`/v1/trainer/jobs/${id}/cancel`).set(as(t1)).send({ reason: 'Too late now' }).expect(409);
      expect((await pool.query(`select status from bookings where id = $1`, [id])).rows[0].status).toBe('confirmed');
    });

    it('keeps a private note per session and lists finished sessions with their note', async () => {
      const id = await bookingId(me, await addressFor(me), slot(30));
      await assign(id, t1Id).expect(200);
      const noted = (await http().put(`/v1/trainer/jobs/${id}/note`).set(as(t1)).send({ note: '  Bring a mat next time  ' }).expect(200)).body as Awaited<ReturnType<typeof board>>;
      expect(noted.mine.find((j) => j.id === id)?.note).toBe('Bring a mat next time');
      await http().put(`/v1/trainer/jobs/${id}/note`).set(as(t2)).send({ note: 'Not mine' }).expect(404); // only the trainer who holds it
      await pool.query(`update bookings set starts_at = now() - interval '2 hours' where id = $1`, [id]);
      const before = (await board(t1)).doneCount;
      const codes = (await pool.query(`select start_code, end_code from bookings where id = $1`, [id])).rows[0] as { start_code: string; end_code: string };
      await http().post(`/v1/trainer/jobs/${id}/check-in`).set(as(t1)).send({ code: codes.start_code }).expect(200);
      const done = (await http().post(`/v1/trainer/jobs/${id}/check-out`).set(as(t1)).send({ code: codes.end_code }).expect(200)).body as Awaited<ReturnType<typeof board>>;
      expect(done.mine.find((j) => j.id === id)).toBeUndefined();
      expect(done.done[0]).toMatchObject({ id, note: 'Bring a mat next time' });
      expect(done.doneCount).toBe(before + 1);
      expect((await board(t2)).done.some((j) => j.id === id)).toBe(false);
      const cleared = (await http().put(`/v1/trainer/jobs/${id}/note`).set(as(t1)).send({ note: '' }).expect(200)).body as Awaited<ReturnType<typeof board>>;
      expect(cleared.done[0]?.note).toBe('');
    });

    it('a trainer who switches off is not offered new sessions and cannot take one; switching on brings them back', async () => {
      const id = await bookingId(me, await addressFor(me), slot(31));
      await dispatch();
      expect((await board(t2)).open.map((j) => j.id)).toContain(id);
      const off = (await http().put('/v1/trainer/jobs/availability').set(as(t2)).send({ acceptingJobs: false }).expect(200)).body as { acceptingJobs: boolean; open: unknown[] };
      expect(off).toMatchObject({ acceptingJobs: false, open: [] });
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t2)).expect(409);
      // A session opened while switched off is not offered to them at all.
      const later = await bookingId(me, await addressFor(me), slot(32));
      await dispatch();
      expect((await pool.query(`select 1 from job_alerts where booking_id = $1 and trainer_id = $2`, [later, t2Id])).rows).toHaveLength(0);
      const on = (await http().put('/v1/trainer/jobs/availability').set(as(t2)).send({ acceptingJobs: true }).expect(200)).body as { acceptingJobs: boolean };
      expect(on.acceptingJobs).toBe(true);
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t2)).expect(200);
    });

    it('reminds the trainer about 30 minutes before a session, once, and again if it is moved', async () => {
      const id = await bookingId(me, await addressFor(me), slot(34));
      await assign(id, t1Id).expect(200);
      const remind = () => app.get(TrainerReminderService).runOnce();
      expect(await remind()).toBe(0); // far away: nothing yet
      await pool.query(`update bookings set starts_at = now() + interval '20 minutes' where id = $1`, [id]);
      expect(await remind()).toBe(1);
      expect(await remind()).toBe(0); // not twice
      await worker().runOnce();
      const mails = mail.sent.filter((m) => m.to === 'asha@trainer.test' && m.subject.startsWith('Starts in about'));
      expect(mails).toHaveLength(1);
      expect(mails[0]!.subject).toMatch(/Starts in about 2\d minutes/);
      await pool.query(`update bookings set starts_at = now() + interval '25 minutes' where id = $1`, [id]);
      expect(await remind()).toBe(1); // moved: a fresh reminder
    });

    it('does not send a reminder for a session that was cancelled before the email went out', async () => {
      const id = await bookingId(me, await addressFor(me), slot(35));
      await assign(id, t1Id).expect(200);
      await pool.query(`update bookings set starts_at = now() + interval '20 minutes' where id = $1`, [id]);
      expect(await app.get(TrainerReminderService).runOnce()).toBe(1);
      await pool.query(`update bookings set status = 'rematching', coach_id = null where id = $1`, [id]);
      mail.sent.length = 0;
      await worker().runOnce();
      expect(mail.sent.some((m) => m.subject.startsWith('Starts in about'))).toBe(false);
    });

    it('lets ops see which trainers switched themselves off', async () => {
      await http().put('/v1/trainer/jobs/availability').set(as(t2)).send({ acceptingJobs: false }).expect(200);
      const list = (await http().get('/v1/admin/trainer-applications').set(as(owner)).expect(200)).body.items as { name: string; trainerStatus: string | null; acceptingJobs: boolean | null }[];
      expect(list.find((i) => i.name.startsWith('Bala'))).toMatchObject({ trainerStatus: 'active', acceptingJobs: false });
      expect(list.find((i) => i.name.startsWith('Asha'))).toMatchObject({ acceptingJobs: true });
      const id = await bookingId(me, await addressFor(me), slot(36));
      const options = (await http().get(`/v1/admin/sessions/${id}/available-trainers`).set(as(owner)).expect(200)).body as { name: string; acceptingJobs: boolean }[];
      expect(options.find((o) => o.name.startsWith('Bala'))?.acceptingJobs).toBe(false); // still listed: ops can assign directly
    });
  });

  describe('sessions that overlap in time', () => {
    // Today every slot is on the hour and no session is longer than 60 minutes, so two sessions only clash at the same start.
    // This makes the rule ready for longer sessions: a 90 minute session from 17:00 runs until 18:30.
    it('does not put a trainer on a session that starts before another one ends, but allows back to back', async () => {
      await pool.query(`update services set duration_max_minutes = 90 where slug = 'yoga'`);
      try {
        const a = await bookingId(me, await addressFor(me), slot(3, 17));
        const b = await bookingId(friend, await addressFor(friend), slot(3, 18)); // starts inside the first session
        const c = await bookingId(me, await addressFor(me), slot(3, 19)); // starts after it ended
        await assign(a, t1Id).expect(200);
        expect((await available(b)).map((t) => t.name)).toEqual(['Bala Rao']);
        await assign(b, t1Id).expect(409);
        await http().post(`/v1/trainer/jobs/${b}/accept`).set(as(t1)).expect(409);
        expect((await board(t1)).open.map((j) => j.id)).not.toContain(b);
        expect((await board(t1)).open.map((j) => j.id)).toContain(c);
        await http().post(`/v1/trainer/jobs/${c}/accept`).set(as(t1)).expect(200);
      } finally {
        await pool.query(`update services set duration_max_minutes = 60 where slug = 'yoga'`);
      }
    });
  });

  describe('where an open job is', () => {
    it('shows the area name of the pincode when the customer only typed the city, and how near the job is to the trainer', async () => {
      const near = (await pool.query<{ pincode: string }>(`select cp.pincode from cluster_pincodes cp join clusters c on c.id = cp.cluster_id where c.slug = 'bandra-khar' and cp.pincode <> '400050' limit 1`)).rows[0]!.pincode;
      await pool.query(`update trainer_applications set address_pincode = '400050' where user_id = $1`, [t1Id]);
      await pool.query(`update trainer_applications set address_pincode = $2 where user_id = $1`, [t2Id, near]);
      const id = await bookingId(me, await addressFor(me), slot(3));
      await pool.query(`update bookings set address_area = 'Mumbai' where id = $1`, [id]);
      await pool.query(`insert into job_alerts (booking_id, trainer_id, wave) values ($1, $2, 1), ($1, $3, 2) on conflict do nothing`, [id, t1Id, t2Id]);
      expect((await board(t1)).open[0]).toMatchObject({ area: 'Bandra-Khar', nearness: 'same_pincode' });
      expect((await board(t2)).open[0]).toMatchObject({ area: 'Bandra-Khar', nearness: 'near_you' });
      await pool.query(`update trainer_applications set address_pincode = '400076' where user_id = $1`, [t2Id]);
      expect((await board(t2)).open[0]).toMatchObject({ nearness: 'elsewhere' });
    });
  });

  describe('trainer account deletion', () => {
    const remove = (t: string) => http().delete('/v1/trainer-application/account').set(as(t));
    it('is refused while a session is still ahead, then wipes the account and ends sign-in', async () => {
      const id = await bookingId(me, await addressFor(me), slot(3));
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t1)).expect(200);
      const refused = await remove(t1).expect(409);
      expect(refused.body.error.code).toBe('HAS_ACTIVE_BOOKINGS');
      await http().post(`/v1/trainer/jobs/${id}/cancel`).set(as(t1)).send({ reason: 'Leaving Zoove' }).expect(200);
      const appRow = (await pool.query<{ id: string }>(`select id from trainer_applications where user_id = $1`, [t1Id])).rows[0]!.id;
      await pool.query(`update trainer_applications set email = 'asha@trainer.test', pan_last4 = 'ABCD', bio = 'Hello' where id = $1`, [appRow]);
      await pool.query(`insert into trainer_documents (id, application_id, kind, storage_key, mime_type, size_bytes) values (gen_random_uuid(), $1, 'selfie', 'test/selfie-1', 'image/jpeg', 1000)`, [appRow]);
      await pool.query(`insert into trainer_session_notes (booking_id, trainer_id, note) values ($1, $2, 'private')`, [id, t1Id]);
      await remove(t1).expect(204);
      const user = (await pool.query(`select status, email, verified_email, phone_e164, full_name from users where id = $1`, [t1Id])).rows[0];
      expect(user).toMatchObject({ status: 'deleted', email: null, verified_email: null, phone_e164: null, full_name: null });
      expect((await pool.query(`select first_name, email, pan_last4, bio from trainer_applications where id = $1`, [appRow])).rows[0]).toEqual({ first_name: null, email: null, pan_last4: null, bio: null });
      expect((await pool.query(`select count(*)::int as c from trainer_documents where application_id = $1`, [appRow])).rows[0].c).toBe(0);
      expect((await pool.query(`select status, accepting_jobs from trainers where user_id = $1`, [t1Id])).rows[0]).toEqual({ status: 'revoked', accepting_jobs: false });
      expect((await pool.query(`select count(*)::int as c from refresh_tokens where user_id = $1`, [t1Id])).rows[0].c).toBe(0);
      expect((await pool.query(`select count(*)::int as c from trainer_session_notes where trainer_id = $1`, [t1Id])).rows[0].c).toBe(0);
      expect((await http().get('/v1/trainer/jobs').set(as(t1))).status).not.toBe(200);
      // The other trainer is unaffected, the session is open again for others, and ops cannot bring the deleted trainer back.
      expect((await board(t2)).open.map((j) => j.id)).toContain(id);
      const adminApp = (await http().get('/v1/admin/trainer-applications').set(as(owner)).expect(200)).body.items as { id: string; trainerStatus: string | null }[];
      const gone = adminApp.find((i) => i.trainerStatus === 'revoked');
      await http().post(`/v1/admin/trainer-applications/${gone!.id}/trainer-status`).set(as(owner)).send({ status: 'active' }).expect(409);
    });

    it('is not for customers who have bookings', async () => {
      await bookingId(me, await addressFor(me), slot(3));
      await remove(me).expect(403);
    });
  });
});
