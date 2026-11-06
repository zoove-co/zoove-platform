import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';

import { CompletionSweepService } from '../src/bookings/completion-sweep.service';
import { DispatchService } from '../src/bookings/dispatch.service';
import { APP_CONFIG, type Env } from '../src/config/env';
import { DatabaseService } from '../src/database/database.service';
import { EmailProvider, type EmailMessage } from '../src/email/email.provider';
import { EmailChannel } from '../src/notifications/channels/email.channel';
import { ExpoPushChannel } from '../src/notifications/channels/expo-push.channel';
import { CUSTOMER_CHANNELS, type ChannelResult, type CustomerMessage, type MessageChannel } from '../src/notifications/message-channel';
import { OutboxWorkerService } from '../src/notifications/outbox-worker.service';
import { PackageRemindersService } from '../src/packages/package-reminders.service';
import { PackagesService } from '../src/packages/packages.service';
import { signIn, startApp, CODE } from './helpers';

class MemoryEmail extends EmailProvider {
  sent: EmailMessage[] = [];
  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}
const mail = new MemoryEmail();
process.env.OPS_NOTIFY_EMAILS = 'ops@zoove.test';

class FakeChannel implements MessageChannel {
  calls: CustomerMessage[] = [];
  failTimes = 0;
  constructor(readonly name: string) {}
  deliver(message: CustomerMessage): Promise<ChannelResult> {
    if (this.failTimes > 0) {
      this.failTimes -= 1;
      return Promise.reject(new Error(`${this.name} is down`));
    }
    this.calls.push(message);
    return Promise.resolve('sent');
  }
}
const okChannel = new FakeChannel('fake-ok');
const flakyChannel = new FakeChannel('fake-flaky');

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const phone = () => `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number, hour = 18) => new Date(`${isoDate(days)}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString();
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);

suite('finding a coach, closing sessions, and telling people', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let customer: string;
  let customerId: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const dispatch = () => app.get(DispatchService);
  const worker = () => app.get(OutboxWorkerService);

  async function drain(): Promise<void> {
    for (let i = 0; i < 400; i += 1) if ((await worker().runOnce()) === 0) return;
  }
  async function trainer(first: string, pincode: string | null, specialties: string[] = []): Promise<{ token: string; id: string; email: string }> {
    const p = phone();
    const token = await signIn(app, pool, p);
    const id = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [p])).rows[0]!.id;
    const email = `${first.toLowerCase()}-${Date.now()}-${(n += 1)}@zoove.test`;
    await pool.query(`update users set verified_email = $2 where id = $1`, [id, email]);
    const appId = await pool.query<{ id: string }>(
      `insert into trainer_applications (id, user_id, status, first_name, last_name, address_pincode, specialties) values (gen_random_uuid(), $1, 'approved', $2, 'Rao', $3, $4) returning id`,
      [id, first, pincode, specialties],
    );
    await pool.query(`insert into trainers (user_id, application_id) values ($1, $2)`, [id, appId.rows[0]!.id]);
    return { token, id, email };
  }
  async function addressFor(t: string, pincode = '400050') {
    return (await http().post('/v1/addresses').set(as(t)).send({ label: 'Home', line: `Flat ${(n += 1)}, Dispatch Heights`, area: 'Bandra West', pincode }).expect(201)).body.id as string;
  }
  const book = (t: string, addressId: string, extra: Record<string, unknown>) =>
    http().post('/v1/bookings').set(as(t)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', addressId, idempotencyKey: `dc-${Date.now()}-${(n += 1)}`, ...extra });
  const scheduled = async (t: string, addressId: string, startsAt: string) => (await book(t, addressId, { mode: 'scheduled', startsAt }).expect(201)).body.id as string;
  const instant = async (t: string, addressId: string) => (await book(t, addressId, { mode: 'instant' }).expect(201)).body.id as string;
  const alertedTo = async (bookingId: string) => (await pool.query<{ trainer_id: string }>(`select trainer_id from job_alerts where booking_id = $1`, [bookingId])).rows.map((r) => r.trainer_id).sort();
  const sorted = (...ids: string[]) => [...ids].sort();
  const board = async (t: string) => (await http().get('/v1/trainer/jobs').set(as(t)).expect(200)).body as { open: { id: string }[]; mine: { id: string; canCheckIn: boolean }[] };
  // Check in and out with the session's own codes (the way the customer would hand them over).
  const finish = async (t: string, id: string) => {
    const c = (await pool.query(`select start_code, end_code from bookings where id = $1`, [id])).rows[0] as { start_code: string; end_code: string };
    await http().post(`/v1/trainer/jobs/${id}/check-in`).set(as(t)).send({ code: c.start_code }).expect(200);
    await pool.query(`update bookings set ends_at = now() - interval '1 minute' where id = $1`, [id]); // the timer ran out
    await http().post(`/v1/trainer/jobs/${id}/check-out`).set(as(t)).send({ code: c.end_code }).expect(200);
  };
  const accept = (t: string, id: string) => http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t));
  const statusOf = async (id: string) => (await pool.query<{ status: string }>(`select status from bookings where id = $1`, [id])).rows[0]!.status;
  const emailsTo = (to: string) => mail.sent.filter((m) => m.to === to);
  const codeOf = (id: string) => `ZV-${id.replace(/-/g, '').slice(-8).toUpperCase()}`;

  let owner: string;
  async function adminToken(email: string) {
    const user = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [email]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [user.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner, permissions) values ($1, 'Ritesh', 'Team', true, '{}')`, [user.rows[0]!.id]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    return (await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  }

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (b) => b.overrideProvider(EmailProvider).useValue(mail).overrideProvider(CUSTOMER_CHANNELS).useValue([okChannel, flakyChannel])));
    await pool.query(`update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar'`);
    await pool.query(`update bookings set status = 'cancelled', cancelled_at = now() where status in ('matching', 'rematching')`); // leftovers of earlier runs
    await pool.query(`delete from outbox_events`);
    const customerPhone = phone();
    customer = await signIn(app, pool, customerPhone);
    customerId = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [customerPhone])).rows[0]!.id;
    owner = await adminToken(`owner-dc-${Date.now()}@zoove.test`);
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  describe('offering a session to trainers, nearest first', () => {
    it('alerts the same pincode first, then the cluster, then everyone who teaches it, and never repeats', async () => {
      const near = await trainer('Near', '400050');
      const cluster = await trainer('Cluster', '400052');
      const far = await trainer('Far', '411001');
      const wrongSkill = await trainer('Strong', '400050', ['strength']);
      const id = await scheduled(customer, await addressFor(customer, '400050'), slot(3));

      await dispatch().runOnce();
      expect(await alertedTo(id)).toEqual(expect.arrayContaining([near.id]));
      expect(await alertedTo(id)).not.toContain(cluster.id);
      expect(await alertedTo(id)).not.toContain(far.id);
      expect(await alertedTo(id)).not.toContain(wrongSkill.id);
      // The job board shows only what a trainer was alerted about, and only those trainers can take it.
      expect((await board(near.token)).open.map((j) => j.id)).toContain(id);
      expect((await board(cluster.token)).open.map((j) => j.id)).not.toContain(id);
      await accept(cluster.token, id).expect(409);

      await dispatch().runOnce(minutesFromNow(11));
      expect(await alertedTo(id)).toContain(cluster.id);
      expect(await alertedTo(id)).not.toContain(far.id);
      expect((await board(cluster.token)).open.map((j) => j.id)).toContain(id);

      await dispatch().runOnce(minutesFromNow(26));
      expect(await alertedTo(id)).toContain(far.id);
      expect(await alertedTo(id)).not.toContain(wrongSkill.id);

      const before = (await alertedTo(id)).length;
      await dispatch().runOnce(minutesFromNow(60));
      expect((await alertedTo(id)).length).toBe(before);

      // Each alert also became an email to that trainer (once).
      mail.sent.length = 0;
      await drain();
      expect(emailsTo(near.email).filter((m) => m.subject.startsWith('New Yoga session') && m.text.includes(codeOf(id))).length).toBe(1);
      expect(emailsTo(wrongSkill.email).filter((m) => m.text.includes(codeOf(id))).length).toBe(0);

      // First to accept gets it; the others stop seeing it and no longer get alerts about it.
      await accept(far.token, id).expect(200);
      expect((await board(near.token)).open.map((j) => j.id)).not.toContain(id);
    });

    it('alerts every eligible trainer at once when ops switch that on, and goes back to waves when they switch it off', async () => {
      const near = await trainer('AllNear', '400050');
      const far = await trainer('AllFar', '411001');
      const wrongSkill = await trainer('AllStrong', '400050', ['strength']);
      expect((await http().get('/v1/admin/sessions/dispatch-settings').set(as(owner)).expect(200)).body).toEqual({ alertAll: false });
      await http().get('/v1/admin/sessions/dispatch-settings').set(as(customer)).expect(403);
      await http().put('/v1/admin/sessions/dispatch-settings').set(as(customer)).send({ alertAll: true }).expect(403);
      await http().put('/v1/admin/sessions/dispatch-settings').set(as(owner)).send({ alertAll: 'yes' }).expect(400);

      await http().put('/v1/admin/sessions/dispatch-settings').set(as(owner)).send({ alertAll: true }).expect(200);
      try {
        const id = await scheduled(customer, await addressFor(customer, '400050'), slot(22));
        await dispatch().runOnce();
        const to = await alertedTo(id);
        expect(to).toEqual(expect.arrayContaining([near.id, far.id]));
        expect(to).not.toContain(wrongSkill.id);
        expect((await board(far.token)).open.map((j) => j.id)).toContain(id);
        expect((await pool.query(`select dispatch_wave from bookings where id = $1`, [id])).rows[0].dispatch_wave).toBe(3);
        expect((await pool.query(`select 1 from audit_log where action = 'settings.dispatch_alert_all'`)).rowCount).toBeGreaterThan(0);
      } finally {
        await http().put('/v1/admin/sessions/dispatch-settings').set(as(owner)).send({ alertAll: false }).expect(200);
      }
      // Off again: a new session goes to the same pincode only at first.
      const later = await scheduled(customer, await addressFor(customer, '400050'), slot(23));
      await dispatch().runOnce();
      expect(await alertedTo(later)).toContain(near.id);
      expect(await alertedTo(later)).not.toContain(far.id);
    });

    it('offers an open session to a trainer who is approved after the waves already ran', async () => {
      const early = await trainer('Early', '400050');
      const id = await scheduled(customer, await addressFor(customer, '400050'), slot(24));
      await dispatch().runOnce();
      expect(await alertedTo(id)).toContain(early.id);
      await dispatch().runOnce(minutesFromNow(26)); // every wave has run
      const late = await trainer('Late', '411001');
      expect(await alertedTo(id)).not.toContain(late.id);
      await dispatch().runOnce();
      expect(await alertedTo(id)).toContain(late.id);
      expect((await board(late.token)).open.map((j) => j.id)).toContain(id);
      const n1 = (await alertedTo(id)).length;
      await dispatch().runOnce();
      expect((await alertedTo(id)).length).toBe(n1);
      await accept(late.token, id).expect(200);
      await dispatch().runOnce();
      expect(await statusOf(id)).toBe('confirmed');
    });

    it('moves straight on when a wave has nobody', async () => {
      const a = await trainer('Skip', '400050');
      const id = await scheduled(customer, await addressFor(customer, '400051'), slot(4));
      await dispatch().runOnce(); // nobody lives in 400051, so the cluster is offered at once
      expect(await alertedTo(id)).toContain(a.id);
      expect((await pool.query(`select dispatch_wave from bookings where id = $1`, [id])).rows[0].dispatch_wave).toBe(2);
    });

    it('does not alert a trainer who is busy at that time or who dropped the session', async () => {
      const busy = await trainer('Busy', '400050');
      const ok = await trainer('Free', '400050');
      const when = slot(5);
      const first = await scheduled(customer, await addressFor(customer), when);
      await pool.query(`update bookings set status = 'confirmed', coach_id = $2 where id = $1`, [first, busy.id]);
      const other = await signIn(app, pool, phone());
      const second = await scheduled(other, await addressFor(other), when);
      await dispatch().runOnce();
      const to = await alertedTo(second);
      expect(to).toContain(ok.id);
      expect(to).not.toContain(busy.id);
    });

    it('does not email a trainer about a job somebody else already took', async () => {
      const a = await trainer('Quick', '400050');
      const b = await trainer('Slow', '400050');
      const id = await scheduled(customer, await addressFor(customer), slot(6));
      await dispatch().runOnce();
      await accept(a.token, id).expect(200);
      mail.sent.length = 0;
      await drain();
      expect(emailsTo(b.email).filter((m) => m.text.includes(codeOf(id))).length).toBe(0);
    });
  });

  describe('telling the trainer when the customer changes or cancels', () => {
    it('emails the trainer on cancel, on a move they can keep, and on a move to a time they are busy', async () => {
      const t = await trainer('Told', '400050');
      // 1. cancel
      const a = await scheduled(customer, await addressFor(customer), slot(8));
      await dispatch().runOnce();
      await accept(t.token, a).expect(200);
      mail.sent.length = 0;
      await http().post(`/v1/bookings/${a}/cancel`).set(as(customer)).expect(201);
      await drain();
      expect(emailsTo(t.email).some((m) => m.subject.startsWith('Cancelled:') && m.text.includes('Please do not travel'))).toBe(true);
      expect(await statusOf(a)).toBe('cancelled');

      // 2. move to a free time: the trainer keeps it and is told the new time
      const b = await scheduled(customer, await addressFor(customer), slot(9));
      await dispatch().runOnce();
      await accept(t.token, b).expect(200);
      mail.sent.length = 0;
      await http().post(`/v1/bookings/${b}/reschedule`).set(as(customer)).send({ startsAt: slot(9, 19) }).expect((r) => expect([r.status, r.body.error ?? r.body.message ?? r.body]).toEqual([201, expect.anything()]));
      await drain();
      expect(emailsTo(t.email).some((m) => m.subject.startsWith('Session moved'))).toBe(true);
      expect(await statusOf(b)).toBe('confirmed');

      // 3. move to a time the trainer is busy: taken off, trainer told, session goes back to open
      const c = await scheduled(customer, await addressFor(customer), slot(10));
      await dispatch().runOnce();
      await accept(t.token, c).expect(200);
      const other = await signIn(app, pool, phone());
      const blocker = await scheduled(other, await addressFor(other), slot(10, 19));
      await pool.query(`update bookings set status = 'confirmed', coach_id = $2 where id = $1`, [blocker, t.id]);
      mail.sent.length = 0;
      await http().post(`/v1/bookings/${c}/reschedule`).set(as(customer)).send({ startsAt: slot(10, 19) }).expect(201);
      await drain();
      expect(emailsTo(t.email).some((m) => m.subject.startsWith('Removed from your list'))).toBe(true);
      expect(await statusOf(c)).toBe('rematching');
    });

    it('does not email anyone when a session without a trainer is cancelled', async () => {
      const id = await scheduled(customer, await addressFor(customer), slot(11));
      await dispatch().runOnce();
      mail.sent.length = 0;
      await drain();
      mail.sent.length = 0;
      await http().post(`/v1/bookings/${id}/cancel`).set(as(customer)).expect(201);
      await drain();
      expect(mail.sent.filter((m) => m.subject.startsWith('Cancelled:'))).toHaveLength(0);
    });
  });

  describe('instant sessions nobody takes', () => {
    it('tells the customer once after the last wave, lets them pick a date, and offers it to trainers again', async () => {
      const t = await trainer('Insta', '400050');
      const id = await instant(customer, await addressFor(customer));
      // Not yet: an instant session cannot be moved while we are still looking.
      await http().post(`/v1/bookings/${id}/reschedule`).set(as(customer)).send({ startsAt: slot(12) }).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
      await dispatch().runOnce();
      expect(await alertedTo(id)).toContain(t.id);
      expect((await http().get(`/v1/bookings/${id}`).set(as(customer)).expect(200)).body.overdue).toBe(false);

      await dispatch().runOnce(minutesFromNow(61));
      const seen = (await http().get(`/v1/bookings/${id}`).set(as(customer)).expect(200)).body;
      expect(seen.overdue).toBe(true);
      expect(seen.status).toBe('matching'); // never cancelled for them
      const notes = (await http().get('/v1/notifications').set(as(customer)).expect(200)).body as { title: string; bookingId: string }[];
      expect(notes.filter((x) => x.bookingId === id && x.title === 'We could not find a coach right now')).toHaveLength(1);

      await dispatch().runOnce(minutesFromNow(120));
      expect((await pool.query(`select count(*)::int as n from outbox_events where event_type = 'booking.unfilled' and aggregate_id = $1`, [id])).rows[0].n).toBe(1);
      mail.sent.length = 0;
      await drain();
      expect(mail.sent.some((m) => m.to === 'ops@zoove.test' && m.subject.startsWith('Unfilled:'))).toBe(true);

      // The customer picks a date: it becomes a scheduled session, at the price they agreed, and is offered again.
      const priceBefore = seen.totalPaise;
      const moved = (await http().post(`/v1/bookings/${id}/reschedule`).set(as(customer)).send({ startsAt: slot(12) }).expect(201)).body;
      expect(moved.mode).toBe('scheduled');
      expect(moved.overdue).toBe(false);
      expect(moved.totalPaise).toBe(priceBefore);
      expect(await alertedTo(id)).toEqual([]);
      await dispatch().runOnce();
      expect(await alertedTo(id)).toContain(t.id);
    });

    it('can still be accepted and then closed by the trainer, which gives it a start time', async () => {
      const t = await trainer('Insta2', '400050');
      const id = await instant(customer, await addressFor(customer));
      await dispatch().runOnce();
      await accept(t.token, id).expect(200);
      expect((await board(t.token)).mine.find((j) => j.id === id)?.canCheckIn).toBe(true);
      await finish(t.token, id);
      const row = (await pool.query(`select status, starts_at, completed_at from bookings where id = $1`, [id])).rows[0];
      expect(row.status).toBe('completed');
      expect(row.starts_at).not.toBeNull();
    });
  });

  describe('closing a session', () => {
    it('lets only the trainer on it close it, after it started, once; counts for the streak; cannot be cancelled after', async () => {
      const t = await trainer('Closer', '400050');
      const stranger = await trainer('Stranger', '400050');
      const id = await scheduled(customer, await addressFor(customer), slot(13));
      await dispatch().runOnce();
      await accept(t.token, id).expect(200);

      const code = async (col: string) => (await pool.query(`select ${col} as c from bookings where id = $1`, [id])).rows[0].c as string;
      await http().post(`/v1/trainer/jobs/${id}/check-in`).set(as(t.token)).send({ code: await code('start_code') }).expect(409); // far too early
      await http().post(`/v1/trainer/jobs/${id}/check-out`).set(as(t.token)).send({ code: await code('end_code') }).expect(409); // not checked in
      await pool.query(`update bookings set starts_at = now() - interval '1 hour' where id = $1`, [id]);
      await http().post(`/v1/trainer/jobs/${id}/check-in`).set(as(stranger.token)).send({ code: await code('start_code') }).expect(409); // not theirs
      const wrong = (await code('start_code')) === '0000' ? '1111' : '0000';
      await http().post(`/v1/trainer/jobs/${id}/check-in`).set(as(t.token)).send({ code: wrong }).expect(400);
      const live = (await http().post(`/v1/trainer/jobs/${id}/check-in`).set(as(t.token)).send({ code: await code('start_code') }).expect(200)).body as Awaited<ReturnType<typeof board>>;
      expect(live.mine.find((j) => j.id === id)).toMatchObject({ started: true, canCheckIn: false, canCancel: false });
      const seen = (await http().get(`/v1/bookings/${id}`).set(as(customer)).expect(200)).body as { inProgress: boolean; startCode: string | null; endCode: string | null };
      expect(seen).toMatchObject({ inProgress: true, startCode: null, endCode: null }); // the finish code opens when the timer ends
      expect((await pool.query(`select ends_at - started_at as len from bookings where id = $1`, [id])).rows[0].len).toMatchObject({ hours: 1 });
      await http().post(`/v1/trainer/jobs/${id}/check-out`).set(as(t.token)).send({ code: await code('end_code') }).expect(409); // timer still running
      await pool.query(`update bookings set ends_at = now() - interval '1 minute' where id = $1`, [id]);
      expect(((await http().get(`/v1/bookings/${id}`).set(as(customer)).expect(200)).body as { endCode: string }).endCode).toBe(await code('end_code'));
      expect(await app.get(CompletionSweepService).timeUp()).toBeGreaterThanOrEqual(1);
      expect(await app.get(CompletionSweepService).timeUp()).toBe(0); // told once
      expect((await http().get('/v1/admin/sessions?filter=upcoming').set(as(owner)).expect(200)).body.find((x: { id: string }) => x.id === id)).toMatchObject({ live: true });
      await http().post(`/v1/trainer/jobs/${id}/check-out`).set(as(t.token)).send({ code: '12' }).expect(400); // not 4 digits
      const streakBefore = (await http().get('/v1/streak').set(as(customer)).expect(200)).body.totalSessions as number;

      await pool.query(`delete from outbox_events where event_type = 'booking.completed'`);
      await finish(t.token, id);
      await http().post(`/v1/trainer/jobs/${id}/check-out`).set(as(t.token)).send({ code: await code('end_code') }).expect(200); // closing twice changes nothing
      expect(await statusOf(id)).toBe('completed');
      expect((await pool.query(`select count(*)::int as n from outbox_events where event_type = 'booking.completed' and aggregate_id = $1`, [id])).rows[0].n).toBe(1);
      expect((await http().get('/v1/streak').set(as(customer)).expect(200)).body.totalSessions).toBe(streakBefore + 1);
      const notes = (await http().get('/v1/notifications').set(as(customer)).expect(200)).body as { title: string }[];
      expect(notes.some((x) => x.title === 'Session complete')).toBe(true);
      await http().post(`/v1/bookings/${id}/cancel`).set(as(customer)).expect(409);

      // Rating: the customer, once, 1 to 5.
      const done = (await http().get(`/v1/bookings/${id}`).set(as(customer)).expect(200)).body as { canRate: boolean };
      expect(done.canRate).toBe(true);
      await http().post(`/v1/bookings/${id}/rating`).set(as(customer)).send({ stars: 6 }).expect(400);
      const rated = (await http().post(`/v1/bookings/${id}/rating`).set(as(customer)).send({ stars: 5, comment: 'Great session' }).expect(201)).body as { rating: number; canRate: boolean };
      expect(rated).toMatchObject({ rating: 5, canRate: false });
      await http().post(`/v1/bookings/${id}/rating`).set(as(customer)).send({ stars: 1 }).expect(409);
      expect((await pool.query(`select stars, trainer_id from session_ratings where booking_id = $1`, [id])).rows[0]).toMatchObject({ stars: 5, trainer_id: t.id });
      expect((await pool.query(`select count(*)::int as n from outbox_events where event_type = 'booking.rated' and aggregate_id = $1`, [id])).rows[0].n).toBe(1);
    });

    it('locks the codes after five wrong tries', async () => {
      const t = await trainer('Locker', '400050');
      const id = await scheduled(customer, await addressFor(customer), slot(14));
      await dispatch().runOnce();
      await accept(t.token, id).expect(200);
      await pool.query(`update bookings set starts_at = now() - interval '10 minutes', start_code = '4321' where id = $1`, [id]);
      for (let i = 0; i < 5; i++) await http().post(`/v1/trainer/jobs/${id}/check-in`).set(as(t.token)).send({ code: '1111' }).expect(400);
      await http().post(`/v1/trainer/jobs/${id}/check-in`).set(as(t.token)).send({ code: '4321' }).expect(429); // even the right one
      await pool.query(`update bookings set code_attempt_at = now() - interval '20 minutes' where id = $1`, [id]);
      await http().post(`/v1/trainer/jobs/${id}/check-in`).set(as(t.token)).send({ code: '4321' }).expect(200);
    });

    it('lets ops close a session too, and refuses one with no trainer', async () => {
      const t = await trainer('OpsClose', '400050');
      const id = await scheduled(customer, await addressFor(customer), slot(14));
      await http().post(`/v1/admin/sessions/${id}/complete`).set(as(owner)).expect(409); // no trainer yet
      await dispatch().runOnce();
      await accept(t.token, id).expect(200);
      await pool.query(`update bookings set starts_at = now() - interval '2 hours' where id = $1`, [id]);
      await http().post(`/v1/admin/sessions/${id}/complete`).set(as(owner)).expect(200);
      await http().post(`/v1/admin/sessions/${id}/complete`).set(as(owner)).expect(200); // twice changes nothing
      expect(await statusOf(id)).toBe('completed');
      expect((await pool.query(`select count(*)::int as n from audit_log where action = 'session.completed' and entity_id = $1`, [id])).rows[0].n).toBe(1);
    });

    it('flags a session that nobody closed after it ended, once, to ops', async () => {
      const t = await trainer('Forgot', '400050');
      const id = await scheduled(customer, await addressFor(customer), slot(15));
      await dispatch().runOnce();
      await accept(t.token, id).expect(200);
      await pool.query(`update bookings set starts_at = now() - interval '1 hour' where id = $1`, [id]);
      const sweep = () => app.get(CompletionSweepService).runOnce();
      const flaggedBefore = (await pool.query(`select count(*)::int as n from bookings where completion_flagged_at is not null`)).rows[0].n as number;
      await sweep();
      expect((await pool.query(`select completion_flagged_at from bookings where id = $1`, [id])).rows[0].completion_flagged_at).toBeNull(); // only 1h in: still within the grace time
      await pool.query(`update bookings set starts_at = now() - interval '4 hours' where id = $1`, [id]);
      expect(await sweep()).toBeGreaterThanOrEqual(1);
      expect(await sweep()).toBe(0);
      mail.sent.length = 0;
      await drain();
      expect(mail.sent.filter((m) => m.subject.startsWith('Not closed:') && m.text.includes('Forgot'))).toHaveLength(1);
      expect(flaggedBefore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('telling the customer on every channel', () => {
    it('retries only the channel that failed, never the ones that worked', async () => {
      await pool.query(`delete from outbox_events`);
      okChannel.calls = [];
      flakyChannel.calls = [];
      flakyChannel.failTimes = 1;
      const id = await scheduled(customer, await addressFor(customer), slot(16));
      await worker().runOnce();
      expect(okChannel.calls.filter((c) => c.bookingId === id)).toHaveLength(1);
      expect(flakyChannel.calls.filter((c) => c.bookingId === id)).toHaveLength(0);
      const failed = (await pool.query(`select attempts, last_error, published_at from outbox_events where event_type = 'customer.notify' and payload->>'bookingId' = $1`, [id])).rows[0];
      expect(failed.attempts).toBe(1);
      expect(failed.last_error).toContain('fake-flaky is down');
      expect(failed.published_at).toBeNull();

      await pool.query(`update outbox_events set next_attempt_at = now() where event_type = 'customer.notify'`);
      await worker().runOnce();
      expect(okChannel.calls.filter((c) => c.bookingId === id)).toHaveLength(1); // not repeated
      expect(flakyChannel.calls.filter((c) => c.bookingId === id)).toHaveLength(1);
      expect((await pool.query(`select published_at from outbox_events where event_type = 'customer.notify' and payload->>'bookingId' = $1`, [id])).rows[0].published_at).not.toBeNull();
    });

    it('emails a customer who has an email, and skips one who does not', async () => {
      const channel = new EmailChannel(app.get(DatabaseService), mail);
      const phoneOnlyPhone = phone();
      await signIn(app, pool, phoneOnlyPhone);
      const phoneOnlyId = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [phoneOnlyPhone])).rows[0]!.id;
      expect(await channel.deliver({ userId: phoneOnlyId, title: 'Hello', body: 'World', bookingId: null })).toBe('skipped');
      await pool.query(`update users set verified_email = $2 where id = $1`, [customerId, `cust-${Date.now()}@zoove.test`]);
      mail.sent.length = 0;
      expect(await channel.deliver({ userId: customerId, title: 'Your coach is set', body: 'Coach Asha will come.', bookingId: null })).toBe('sent');
      expect(mail.sent[0]?.subject).toBe('Your coach is set');
      expect(mail.sent[0]?.text).toContain('Coach Asha will come.');
    });

    it('sends push to registered phones, removes dead tokens, skips customers with none', async () => {
      const token = `ExponentPushToken[${Date.now()}aaaa]`;
      const dead = `ExponentPushToken[${Date.now()}dead]`;
      await http().post('/v1/me/devices').set(as(customer)).send({ token, platform: 'android' }).expect(204);
      await http().post('/v1/me/devices').set(as(customer)).send({ token: dead, platform: 'ios' }).expect(204);
      await http().post('/v1/me/devices').set(as(customer)).send({ token, platform: 'android' }).expect(204); // same phone again: one row
      await http().post('/v1/me/devices').set(as(customer)).send({ token: 'x', platform: 'ios' }).expect(400);
      expect((await pool.query(`select count(*)::int as n from notification_devices where user_id = $1`, [customerId])).rows[0].n).toBe(2);

      const config = app.get<Env>(APP_CONFIG);
      const db = app.get(DatabaseService);
      let sentBody: { to: string }[] = [];
      const good = (async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(init.body as string) as { to: string }[];
        return new Response(JSON.stringify({ data: sentBody.map((m) => (m.to === dead ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })) }));
      }) as unknown as typeof fetch;
      const msg = { userId: customerId, title: 'T', body: 'B', bookingId: 'b1' };
      const rows = (await pool.query<{ token: string }>(`select token from notification_devices where user_id = $1 order by created_at`, [customerId])).rows;
      expect(await new ExpoPushChannel(db, config, good).deliver(msg)).toBe('sent');
      expect(sentBody.map((m) => m.to).sort()).toEqual(rows.map((r) => r.token).sort());
      expect((await pool.query(`select count(*)::int as n from notification_devices where user_id = $1`, [customerId])).rows[0].n).toBe(1); // the dead one went

      const down = (() => Promise.resolve(new Response('no', { status: 503 }))) as unknown as typeof fetch;
      await expect(new ExpoPushChannel(db, config, down).deliver(msg)).rejects.toThrow('503');
      await http().delete('/v1/me/devices').set(as(customer)).send({ token }).expect(204);
      expect(await new ExpoPushChannel(db, config, good).deliver(msg)).toBe('skipped');
    });
  });

  describe('package reminders', () => {
    async function purchase(userId: string, name: string, expiresInDays: number, used: number, total = 5): Promise<string> {
      const r = await pool.query<{ id: string }>(
        `insert into package_purchases (id, user_id, name, sessions_count, list_price_paise, total_paise, status, paid_at, expires_at, credits_total, credits_used, idempotency_key, request_fingerprint)
         values (gen_random_uuid(), $1, $2, $3, 100000, 100000, 'paid', now(), now() + ($4 || ' days')::interval, $3, $5, $6, 'x') returning id`,
        [userId, name, total, String(expiresInDays), used, `rem-${Date.now()}-${(n += 1)}`],
      );
      return r.rows[0]!.id;
    }
    const kindsFor = async (purchaseId: string) => (await pool.query<{ kind: string }>(`select kind from package_reminders where purchase_id = $1 order by sent_at, kind`, [purchaseId])).rows.map((r) => r.kind);

    it('warns 7 days and 1 day before, once each, and again when it ends with sessions unused', async () => {
      const reminders = app.get(PackageRemindersService);
      const soon = await purchase(customerId, 'Remind 5', 5, 2);
      await purchase(customerId, 'Remind far', 30, 0);
      await purchase(customerId, 'Remind used up', 3, 5);
      await reminders.runOnce();
      expect(await kindsFor(soon)).toEqual(['7d']);
      await reminders.runOnce();
      expect(await kindsFor(soon)).toEqual(['7d']); // once

      await reminders.runOnce(minutesFromNow(4.5 * 24 * 60));
      expect((await kindsFor(soon)).sort()).toEqual(['1d', '7d']);

      await pool.query(`delete from outbox_events where event_type = 'package.expired'`);
      await reminders.runOnce(minutesFromNow(6 * 24 * 60));
      expect((await kindsFor(soon)).sort()).toEqual(['1d', '7d', 'expired']);
      await reminders.runOnce(minutesFromNow(6 * 24 * 60));
      expect((await kindsFor(soon)).length).toBe(3);

      const notes = (await http().get('/v1/notifications').set(as(customer)).expect(200)).body as { title: string; body: string }[];
      expect(notes.some((x) => x.title === 'Your package ends soon' && x.body.includes('3 sessions left'))).toBe(true);
      expect(notes.some((x) => x.title === 'Your package ends tomorrow')).toBe(true);
      const ended = notes.find((x) => x.title === 'Your package has ended' && x.body.includes('Remind 5'));
      expect(ended?.body).toContain('3 sessions unused');
      expect(ended?.body).not.toMatch(/refund/i); // we promise nothing we have not decided

      mail.sent.length = 0;
      await drain();
      expect(mail.sent.some((m) => m.to === 'ops@zoove.test' && m.subject.startsWith('Package expired with 3 unused'))).toBe(true);
      // A package with nothing to lose gets no reminders at all.
      expect((await pool.query(`select count(*)::int as n from package_reminders r join package_purchases p on p.id = r.purchase_id where p.name in ('Remind far', 'Remind used up')`)).rows[0].n).toBe(0);
    });
  });

  describe('housekeeping', () => {
    it('warns again after ops extend a package', async () => {
      const id = (await pool.query<{ id: string }>(
        `insert into package_purchases (id, user_id, name, sessions_count, list_price_paise, total_paise, status, paid_at, expires_at, credits_total, credits_used, idempotency_key, request_fingerprint)
         values (gen_random_uuid(), $1, 'Extend me', 4, 100000, 100000, 'paid', now(), now() + interval '3 days', 4, 1, $2, 'x') returning id`, [customerId, `ext-${Date.now()}`])).rows[0]!.id;
      const reminders = app.get(PackageRemindersService);
      await reminders.runOnce();
      expect((await pool.query(`select count(*)::int as n from package_reminders where purchase_id = $1`, [id])).rows[0].n).toBe(1);
      const adminId = (await pool.query<{ id: string }>(`select id from users where verified_email like 'owner-dc-%' order by created_at desc limit 1`)).rows[0]!.id;
      await app.get(PackagesService).grantException(adminId, id, { extraSessions: 0, extendDays: 30, reason: 'goodwill' });
      expect((await pool.query(`select count(*)::int as n from package_reminders where purchase_id = $1`, [id])).rows[0].n).toBe(0);
    });

    it('removes waiting messages and push tokens when a customer deletes their account', async () => {
      const p = phone();
      const t = await signIn(app, pool, p);
      const uid = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [p])).rows[0]!.id;
      const booking = await scheduled(t, await addressFor(t), slot(20));
      await http().post(`/v1/bookings/${booking}/cancel`).set(as(t)).expect(201);
      await http().post('/v1/me/devices').set(as(t)).send({ token: `ExponentPushToken[del-${Date.now()}]`, platform: 'ios' }).expect(204);
      expect((await pool.query(`select count(*)::int as n from outbox_events where event_type = 'customer.notify' and aggregate_id = $1`, [uid])).rows[0].n).toBeGreaterThan(0);
      await http().delete('/v1/me').set(as(t)).expect(204);
      expect((await pool.query(`select count(*)::int as n from outbox_events where event_type = 'customer.notify' and aggregate_id = $1`, [uid])).rows[0].n).toBe(0);
      expect((await pool.query(`select count(*)::int as n from notification_devices where user_id = $1`, [uid])).rows[0].n).toBe(0);
    });
  });
});
