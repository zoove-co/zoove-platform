import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { OverdueSweepService } from '../src/bookings/overdue-sweep.service';
import { EmailProvider, type EmailMessage } from '../src/email/email.provider';
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

const OWNER = 'owner-overdue@zoove.test';
const STAFF = 'staff-overdue@zoove.test';
const ME = '+919876543210';
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number, hour = 18) => new Date(`${isoDate(days)}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString();
const DAY = 86_400_000;

suite('overdue sessions, trainer no-show and package expiry', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let owner: string;
  let staff: string;
  let me: string;
  let address: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = () => `od-key-${Date.now()}-${(n += 1)}`;
  async function adminToken(email: string, name: string, owns: boolean, permissions: string[]) {
    const user = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [email]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [user.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner, permissions) values ($1, $2, 'Team', $3, $4)`, [user.rows[0]!.id, name, owns, permissions]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    return (await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  }
  const book = (t: string, day: number, extra: object = {}) =>
    http().post('/v1/bookings').set(as(t)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId: address, startsAt: slot(day), idempotencyKey: key(), ...extra });
  async function makeTrainer(first: string): Promise<string> {
    const u = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [`${first.toLowerCase()}-${(n += 1)}@trainer.test`]);
    const appId = await pool.query<{ id: string }>(`insert into trainer_applications (id, user_id, status, first_name, last_name) values (gen_random_uuid(), $1, 'approved', $2, 'Rao') returning id`, [u.rows[0]!.id, first]);
    await pool.query(`insert into trainers (user_id, application_id) values ($1, $2)`, [u.rows[0]!.id, appId.rows[0]!.id]);
    return u.rows[0]!.id;
  }
  const assign = (id: string, trainerId: string, t = owner) => http().post(`/v1/admin/sessions/${id}/assign`).set(as(t)).send({ trainerId });
  const noShow = (id: string, t = owner, note = 'Trainer did not reach the address') => http().post(`/v1/admin/sessions/${id}/no-show`).set(as(t)).send({ note });
  const pastStart = (id: string) => pool.query(`update bookings set starts_at = now() - interval '30 minutes' where id = $1`, [id]);
  const notices = async () => (await pool.query<{ title: string }>(`select title from customer_notifications order by created_at`)).rows.map((r) => r.title);
  async function paidPackage(): Promise<string> {
    const pkg = (await http().get('/v1/packages').set(as(me)).expect(200)).body[0];
    const order = (await http().post('/v1/me/packages').set(as(me)).send({ packageId: pkg.id, idempotencyKey: key() }).expect(201)).body;
    await http().post(`/v1/admin/package-orders/${order.id}/mark-paid`).set(as(owner)).send({ method: 'upi', reference: 'UPI-OD-1' }).expect(200);
    return order.id as string;
  }

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
    mail.sent = [];
    await pool.query('truncate table package_purchases, referral_rewards, referrals, referral_codes, discount_attempts, discount_redemptions, discount_codes, booking_events, customer_notifications, bookings, trainers, trainer_application_events, trainer_documents, trainer_applications, otp_challenges, refresh_tokens, admin_profiles, user_roles, users, outbox_events, audit_log cascade');
    me = await signIn(app, pool, ME);
    owner = await adminToken(OWNER, 'Ritesh', true, []);
    staff = await adminToken(STAFF, 'Staff', false, []);
    address = (await http().post('/v1/addresses').set(as(me)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
  });

  describe('trainer no-show', () => {
    it('only after the start time, only by ops, and it puts the session back in the queue with the customer told', async () => {
      const t1 = await makeTrainer('Asha');
      const t2 = await makeTrainer('Dev');
      const booked = (await book(me, 3).expect(201)).body;
      await assign(booked.id, t1).expect(200);

      // Not before the session starts, and not for staff without the Sessions switch.
      await noShow(booked.id).expect(409);
      await pastStart(booked.id);
      await noShow(booked.id, staff).expect(403);
      await http().post(`/v1/admin/sessions/${booked.id}/no-show`).set(as(owner)).send({ note: 'x' }).expect(400);

      const done = (await noShow(booked.id).expect(200)).body;
      expect(done.status).toBe('rematching');
      expect(done.trainerId).toBeNull();
      expect(done.events.map((e: { type: string }) => e.type)).toContain('trainer_no_show');
      expect((await pool.query(`select count(*)::int as c from audit_log where action = 'session.trainer_no_show'`)).rows[0].c).toBe(1);
      // A second press changes nothing: there is no trainer on it any more.
      await noShow(booked.id).expect(409);

      // The customer sees it, is told, and can move or cancel at once. Nothing was cancelled for them.
      const seen = (await http().get(`/v1/bookings/${booked.id}`).set(as(me)).expect(200)).body;
      expect(seen).toMatchObject({ status: 'rematching', coach: null, trainerCancelled: true, overdue: true, canChange: true });
      expect(await notices()).toContain('Your coach did not arrive');
      expect((await http().get('/v1/admin/sessions/summary').set(as(owner)).expect(200)).body).toMatchObject({ needsTrainer: 1, trainerCancelled: 1, overdue: 1 });

      // Ops cannot give a past session a trainer. The customer moves it, then ops assign someone else: not the one who did not come.
      await assign(booked.id, t2).expect(409);
      await http().post(`/v1/bookings/${booked.id}/reschedule`).set(as(me)).send({ startsAt: slot(4) }).expect(201);
      await assign(booked.id, t1).expect(400);
      expect((await assign(booked.id, t2).expect(200)).body.status).toBe('confirmed');
    });

    it('keeps the package credit through a no-show and gives it back if the customer cancels', async () => {
      const t1 = await makeTrainer('Asha');
      await paidPackage();
      const booked = (await book(me, 3, { useCredit: true }).expect(201)).body;
      expect((await http().get('/v1/me/packages').set(as(me)).expect(200)).body.credits.creditsLeft).toBe(3);
      await assign(booked.id, t1).expect(200);
      await pastStart(booked.id);
      await noShow(booked.id).expect(200);
      expect((await http().get('/v1/me/packages').set(as(me)).expect(200)).body.credits.creditsLeft).toBe(3);
      await http().post(`/v1/bookings/${booked.id}/cancel`).set(as(me)).expect(201);
      expect((await http().get('/v1/me/packages').set(as(me)).expect(200)).body.credits.creditsLeft).toBe(4);
    });
  });

  describe('overdue sessions', () => {
    it('tells the customer and ops once, never cancels on its own, and tells again after a new miss', async () => {
      const sweep = app.get(OverdueSweepService);
      const worker = app.get(OutboxWorkerService);
      const booked = (await book(me, 3).expect(201)).body;
      expect(await sweep.runOnce()).toBe(0); // not due yet

      await pastStart(booked.id);
      expect(await sweep.runOnce()).toBe(1);
      expect(await sweep.runOnce()).toBe(0); // once only
      expect(await notices()).toContain('We could not find a coach in time');
      expect((await http().get(`/v1/bookings/${booked.id}`).set(as(me)).expect(200)).body).toMatchObject({ status: 'matching', overdue: true, canChange: true });
      expect((await http().get('/v1/admin/sessions?filter=needs_trainer').set(as(owner)).expect(200)).body[0]).toMatchObject({ id: booked.id, startPassed: true });

      await worker.runOnce();
      expect(mail.sent.filter((m) => m.to === 'ops@zoove.test' && m.subject.startsWith('Overdue:'))).toHaveLength(1);

      // Moving it clears the mark, so a later miss is told again.
      await http().post(`/v1/bookings/${booked.id}/reschedule`).set(as(me)).send({ startsAt: slot(5) }).expect(201);
      expect((await http().get(`/v1/bookings/${booked.id}`).set(as(me)).expect(200)).body.overdue).toBe(false);
      await pastStart(booked.id);
      expect(await sweep.runOnce()).toBe(1);

      // The customer can still cancel an overdue session.
      await http().post(`/v1/bookings/${booked.id}/cancel`).set(as(me)).expect(201);
      await pastStart(booked.id);
      expect(await sweep.runOnce()).toBe(0);
    });

    it('does not mark instant sessions (they have no start time) or sessions that already have a trainer', async () => {
      const sweep = app.get(OverdueSweepService);
      const t1 = await makeTrainer('Asha');
      await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId: address, idempotencyKey: key() }).expect(201);
      const withCoach = (await book(me, 3).expect(201)).body;
      await assign(withCoach.id, t1).expect(200);
      await pastStart(withCoach.id);
      expect(await sweep.runOnce()).toBe(0);
      // It shows up for ops as "coach did not arrive" instead.
      const row = (await http().get(`/v1/admin/sessions/${withCoach.id}`).set(as(owner)).expect(200)).body;
      expect(row.canMarkNoShow).toBe(true);
    });
  });

  describe('package expiry and exceptions', () => {
    it('a package lasts 60 days from payment', async () => {
      await paidPackage();
      const mine = (await http().get('/v1/me/packages').set(as(me)).expect(200)).body;
      const days = (new Date(mine.purchases[0].expiresAt).getTime() - Date.now()) / DAY;
      expect(days).toBeGreaterThan(59.9);
      expect(days).toBeLessThanOrEqual(60);
      expect(mine.purchases[0]).toMatchObject({ expired: false });
    });

    it('a session must start before the package ends, both when booked and when moved', async () => {
      const id = await paidPackage();
      await pool.query(`update package_purchases set expires_at = now() + interval '2 days' where id = $1`, [id]);
      const refused = await book(me, 3, { useCredit: true }).expect(409);
      expect(refused.body.error.code).toBe('PACKAGE_EXPIRES');
      expect((await http().get('/v1/me/packages').set(as(me)).expect(200)).body.credits.creditsLeft).toBe(4); // nothing was used up
      const booked = (await book(me, 1, { useCredit: true }).expect(201)).body;
      const moved = await http().post(`/v1/bookings/${booked.id}/reschedule`).set(as(me)).send({ startsAt: slot(5) }).expect(409);
      expect(moved.body.error.code).toBe('PACKAGE_EXPIRES');
    });

    it('credits left after the end date cannot be used, and show as unused to ops', async () => {
      const id = await paidPackage();
      await pool.query(`update package_purchases set expires_at = now() - interval '1 day', credits_used = 1 where id = $1`, [id]);
      const mine = (await http().get('/v1/me/packages').set(as(me)).expect(200)).body;
      expect(mine.credits.creditsLeft).toBe(0);
      expect(mine.purchases[0]).toMatchObject({ expired: true, creditsLeft: 0, creditsUnused: 3 });
      expect((await book(me, 2, { useCredit: true }).expect(409)).body.error.code).toBe('NO_CREDITS');
    });

    it('ops can add days and sessions, with a reason, on the record, and the customer is told', async () => {
      const id = await paidPackage();
      const grant = (body: object, t = owner) => http().post(`/v1/admin/package-orders/${id}/exception`).set(as(t)).send(body);
      await pool.query(`update package_purchases set expires_at = now() - interval '1 day', credits_used = 2 where id = $1`, [id]);

      await grant({ extraSessions: 1, extendDays: 14, reason: 'Trainer cancelled twice' }, staff).expect(403);
      await grant({ extraSessions: 0, extendDays: 0, reason: 'Nothing chosen' }).expect(400);
      await grant({ extraSessions: 1, extendDays: 0, reason: 'Missing days' }).expect(400); // the package has ended
      await grant({ extraSessions: 1, extendDays: 14, reason: 'x' }).expect(400); // a real reason is needed

      const done = (await grant({ extraSessions: 1, extendDays: 14, reason: 'Trainer cancelled twice' }).expect(200)).body;
      expect(done).toMatchObject({ creditsTotal: 5, creditsLeft: 3, expired: false });
      const left = (new Date(done.expiresAt).getTime() - Date.now()) / DAY;
      expect(left).toBeGreaterThan(13.9);
      expect(left).toBeLessThanOrEqual(14);

      // The customer can use it again.
      await book(me, 3, { useCredit: true }).expect(201);
      expect(await notices()).toContain('Your package was extended');
      const history = (await http().get(`/v1/admin/package-orders/${id}/history`).set(as(owner)).expect(200)).body;
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ reason: 'Trainer cancelled twice', extraSessions: 1, extendDays: 14 });

      // Days on a package that is still running count from its current end date, not from today.
      const before = new Date((await pool.query(`select expires_at from package_purchases where id = $1`, [id])).rows[0].expires_at).getTime();
      await grant({ extraSessions: 0, extendDays: 10, reason: 'Travelling for work' }).expect(200);
      const after = new Date((await pool.query(`select expires_at from package_purchases where id = $1`, [id])).rows[0].expires_at).getTime();
      expect(Math.round((after - before) / DAY)).toBe(10);
    });

    it('only a paid package can be extended', async () => {
      const pkg = (await http().get('/v1/packages').set(as(me)).expect(200)).body[0];
      const order = (await http().post('/v1/me/packages').set(as(me)).send({ packageId: pkg.id, idempotencyKey: key() }).expect(201)).body;
      await http().post(`/v1/admin/package-orders/${order.id}/exception`).set(as(owner)).send({ extraSessions: 1, extendDays: 0, reason: 'Not paid yet' }).expect(409);
    });
  });
});
