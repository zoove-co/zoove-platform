import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { CODE, signIn, startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const ME = '+919876543210';
const T1 = '+919800000001';

suite('trainer earnings, analytics and the links between customer, session and trainer', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let me: string;
  let trainerToken: string;
  let trainerId: string;
  let applicationId: string;
  let owner: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = () => `te-key-${Date.now()}-${(n += 1)}`;
  async function adminToken(email: string, isOwner: boolean, permissions: string[]) {
    const user = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [email]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [user.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner, permissions) values ($1, 'Ops', 'Team', $2, $3)`, [user.rows[0]!.id, isOwner, permissions]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    return (await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  }
  // One finished session for the trainer: book, assign, close.
  async function finishedSession(): Promise<string> {
    const address = (await http().post('/v1/addresses').set(as(me)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
    const id = (await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId: address, idempotencyKey: key() }).expect(201)).body.id as string;
    await http().post(`/v1/admin/sessions/${id}/assign`).set(as(owner)).send({ trainerId }).expect(200);
    await http().post(`/v1/admin/sessions/${id}/complete`).set(as(owner)).send({}).expect(200);
    return id;
  }

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string));
    await pool.query(`update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar'`);
  });
  afterAll(async () => {
    await pool.query(`update clusters set status = 'locked', activated_at = null where slug = 'bandra-khar'`);
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query('truncate table referral_rewards, referrals, referral_codes, discount_attempts, discount_redemptions, discount_codes, booking_events, customer_notifications, bookings, trainers, trainer_application_events, trainer_documents, trainer_applications, otp_challenges, refresh_tokens, admin_profiles, user_roles, users, outbox_events, audit_log cascade');
    await pool.query(`update app_settings set value = 'null'::jsonb where key = 'trainer_payout_paise'`);
    me = await signIn(app, pool, ME);
    trainerToken = await signIn(app, pool, T1);
    trainerId = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [T1])).rows[0]!.id;
    applicationId = (await pool.query<{ id: string }>(`insert into trainer_applications (id, user_id, status, first_name, last_name, phone_e164) values (gen_random_uuid(), $1, 'approved', 'Rishab', 'Rao', $2) returning id`, [trainerId, T1])).rows[0]!.id;
    await pool.query(`insert into trainers (user_id, application_id) values ($1, $2)`, [trainerId, applicationId]);
    owner = await adminToken('owner-earn@zoove.test', true, []);
  });

  it('shows no earnings until an owner sets the flat amount, then fills in sessions already finished', async () => {
    await finishedSession();
    const before = (await http().get('/v1/trainer/insights').set(as(trainerToken)).expect(200)).body;
    expect(before.earningsKnown).toBe(false);
    expect(before.periods.lifetime).toEqual({ sessions: 1, earnedPaise: 0 });
    const set = (await http().put('/v1/admin/trainer-payout').set(as(owner)).send({ paise: 80000 }).expect(200)).body;
    expect(set).toEqual({ payoutPerSessionPaise: 80000, filledIn: 1 });
    const after = (await http().get('/v1/trainer/insights').set(as(trainerToken)).expect(200)).body;
    expect(after.earningsKnown).toBe(true);
    expect(after.periods.lifetime).toEqual({ sessions: 1, earnedPaise: 80000 });
  });

  it('keeps each session at the amount that applied when it was closed', async () => {
    await http().put('/v1/admin/trainer-payout').set(as(owner)).send({ paise: 80000 }).expect(200);
    await finishedSession();
    await http().put('/v1/admin/trainer-payout').set(as(owner)).send({ paise: 90000 }).expect(200);
    await finishedSession();
    const mine = (await http().get('/v1/trainer/insights').set(as(trainerToken)).expect(200)).body;
    expect(mine.periods.lifetime).toEqual({ sessions: 2, earnedPaise: 170000 });
    expect(mine.periods.today.sessions).toBe(2);
    expect(mine.periods.week.earnedPaise).toBe(170000);
    expect(mine.periods.month.earnedPaise).toBe(170000);
    expect(mine.byService).toEqual([{ name: expect.any(String), sessions: 2, earnedPaise: 170000 }]);
    expect(mine.byParticipant).toEqual([{ name: 'Personal', sessions: 2, earnedPaise: 170000 }]);
    expect(mine.byMode).toEqual([{ name: 'Instant', sessions: 2, earnedPaise: 170000 }]);
    expect(mine.weekly).toHaveLength(8);
    expect(mine.weekly[7].earnedPaise).toBe(170000);
    expect(mine.monthly).toHaveLength(6);
    expect(mine.monthly[5].sessions).toBe(2);
    // The trainer never sees what customers paid.
    expect(mine.periods.lifetime.valuePaise).toBeUndefined();
  });

  it('gives ops one trainer page: figures, what customers paid, and live, upcoming and past sessions with links', async () => {
    await http().put('/v1/admin/trainer-payout').set(as(owner)).send({ paise: 80000 }).expect(200);
    const done = await finishedSession();
    const workAddress = (await http().post('/v1/addresses').set(as(me)).send({ label: 'Work', line: 'E-9, Tower', area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
    const open = (await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId: workAddress, idempotencyKey: key() }).expect(201)).body.id as string;
    await http().post(`/v1/admin/sessions/${open}/assign`).set(as(owner)).send({ trainerId }).expect(200);
    const perf = (await http().get(`/v1/admin/trainers/${applicationId}/performance`).set(as(owner)).expect(200)).body;
    expect(perf.insights.periods.lifetime.valuePaise).toBeGreaterThanOrEqual(0);
    expect(perf.insights.periods.lifetime.earnedPaise).toBe(80000);
    expect(perf.upcoming.map((s: { id: string }) => s.id)).toEqual([open]);
    expect(perf.past.map((s: { id: string }) => s.id)).toEqual([done]);
    expect(perf.past[0]).toMatchObject({ earnedPaise: 80000, customerName: expect.any(String), status: 'completed' });
    expect(perf.past[0].customerId).toBe((await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [ME])).rows[0]!.id);
    const session = (await http().get(`/v1/admin/sessions/${done}`).set(as(owner)).expect(200)).body;
    expect(session).toMatchObject({ trainerApplicationId: applicationId, trainerPhone: T1, customerPhone: ME, customerId: perf.past[0].customerId });
    const customer = (await http().get(`/v1/admin/customers/${session.customerId}`).set(as(owner)).expect(200)).body;
    expect(customer.bookings.find((b: { id: string }) => b.id === done).trainerApplicationId).toBe(applicationId);
  });

  it('lets only owners change the amount, and refuses silly amounts', async () => {
    const viewer = await adminToken('viewer-earn@zoove.test', false, ['trainers.view']);
    await http().put('/v1/admin/trainer-payout').set(as(viewer)).send({ paise: 70000 }).expect(403);
    expect((await http().get('/v1/admin/trainer-payout').set(as(viewer)).expect(200)).body).toEqual({ payoutPerSessionPaise: null });
    await http().put('/v1/admin/trainer-payout').set(as(owner)).send({ paise: -5 }).expect(400);
    await http().put('/v1/admin/trainer-payout').set(as(owner)).send({ paise: 99999999 }).expect(400);
    await http().put('/v1/admin/trainer-payout').set(as(owner)).send({ paise: 12.5 }).expect(400);
    const noAccess = await adminToken('none-earn@zoove.test', false, ['customers.view']);
    await http().get(`/v1/admin/trainers/${applicationId}/performance`).set(as(noAccess)).expect(403);
  });

  it('is closed to customers, and an unknown or not-yet-trainer application has no page', async () => {
    await http().get('/v1/trainer/insights').set(as(me)).expect(403);
    await http().get('/v1/trainer/insights').expect(401);
    const pending = (await pool.query<{ id: string }>(`insert into trainer_applications (id, user_id, status, first_name) values (gen_random_uuid(), (select id from users where phone_e164 = $1), 'submitted', 'Asha') returning id`, [ME])).rows[0]!.id;
    await http().get(`/v1/admin/trainers/${pending}/performance`).set(as(owner)).expect(404);
    await http().get('/v1/admin/trainers/not-a-uuid/performance').set(as(owner)).expect(400);
  });
});
