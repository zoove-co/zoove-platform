import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { DispatchService } from '../src/bookings/dispatch.service';
import { CODE, signIn, startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const ME = '+919876543210';
const T1 = '+919800000001';
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number, hour = 18) => new Date(`${isoDate(days)}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString();

suite('checkout details, coach-assigned message and the Needs attention list', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let me: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = () => `ca-key-${Date.now()}-${(n += 1)}`;
  async function adminToken(email: string, owner: boolean, permissions: string[]) {
    const user = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [email]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [user.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner, permissions) values ($1, 'Ops', 'Team', $2, $3)`, [user.rows[0]!.id, owner, permissions]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    return (await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  }
  async function trainer(phone: string, first: string): Promise<{ token: string; id: string }> {
    const token = await signIn(app, pool, phone);
    const id = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [phone])).rows[0]!.id;
    const appId = await pool.query<{ id: string }>(`insert into trainer_applications (id, user_id, status, first_name, last_name) values (gen_random_uuid(), $1, 'approved', $2, 'Rao') returning id`, [id, first]);
    await pool.query(`insert into trainers (user_id, application_id) values ($1, $2)`, [id, appId.rows[0]!.id]);
    return { token, id };
  }
  const address = async () => (await http().post('/v1/addresses').set(as(me)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
  const bookInstant = async () => {
    const addressId = await address();
    return (await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId, idempotencyKey: key() }).expect(201)).body.id as string;
  };

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
    me = await signIn(app, pool, ME);
  });

  describe('checkout details', () => {
    it('saves the mobile a customer types at checkout as an unverified contact number', async () => {
      const before = (await http().get('/v1/me').set(as(me)).expect(200)).body;
      expect(before.contactPhone).toBeNull();
      const after = (await http().patch('/v1/me').set(as(me)).send({ firstName: 'Meera', contactPhone: '+919811122233' }).expect(200)).body;
      expect(after).toMatchObject({ firstName: 'Meera', contactPhone: '+919811122233', phone: ME });
      await http().patch('/v1/me').set(as(me)).send({ contactPhone: '12345' }).expect(400);
    });

    it('keeps the single full name in step with the first and last name, so ops and trainers do not see "Customer"', async () => {
      await http().patch('/v1/me').set(as(me)).send({ firstName: 'Meera', lastName: 'Shah' }).expect(200);
      const read = async () => (await pool.query<{ full_name: string | null }>(`select full_name from users where phone_e164 = $1`, [ME])).rows[0]!.full_name;
      expect(await read()).toBe('Meera Shah');
      await http().patch('/v1/me').set(as(me)).send({ lastName: '' }).expect(200);
      expect(await read()).toBe('Meera');
    });

    it('shows ops the contact number typed at checkout next to the email', async () => {
      await http().patch('/v1/me').set(as(me)).send({ firstName: 'Meera', contactPhone: '+919811122233' }).expect(200);
      const admin = await adminToken('ops-contact@zoove.test', true, []);
      const id = await bookInstant();
      const list = (await http().get('/v1/admin/sessions').set(as(admin)).expect(200)).body;
      const row = (list.items ?? list).find((x: { id: string }) => x.id === id);
      expect(row.customerName).toBe('Meera');
      expect(row.customerContact).toContain(ME);
    });

    it('lets two customers give the same contact number: it is not a sign-in', async () => {
      const other = await signIn(app, pool, '+919812345678');
      await http().patch('/v1/me').set(as(me)).send({ contactPhone: '+919811122233' }).expect(200);
      await http().patch('/v1/me').set(as(other)).send({ contactPhone: '+919811122233' }).expect(200);
    });
  });

  describe('the booking label and the coach-assigned message', () => {
    it('shows "Finding your coach" only until a coach accepts, then "Coach assigned"', async () => {
      const t1 = await trainer(T1, 'Asha');
      const id = await bookInstant();
      expect((await http().get(`/v1/bookings/${id}`).set(as(me)).expect(200)).body.whenLabel).toBe('Finding your coach');
      await app.get(DispatchService).runOnce();
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t1.token)).expect(200);
      const booking = (await http().get(`/v1/bookings/${id}`).set(as(me)).expect(200)).body;
      expect(booking.status).toBe('confirmed');
      expect(booking.whenLabel).toBe('Coach assigned');
      expect(booking.coach.name).toBe('Asha');
    });

    it('tells the customer where the coach is coming, without promising an arrival time for an instant session', async () => {
      const t1 = await trainer(T1, 'Asha');
      const id = await bookInstant();
      await app.get(DispatchService).runOnce();
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t1.token)).expect(200);
      const note = ((await http().get('/v1/notifications').set(as(me)).expect(200)).body as { title: string; body: string }[]).find((x) => x.title === 'Coach assigned')!;
      expect(note.body).toContain('Asha');
      expect(note.body).toContain('Bandra West');
      expect(note.body).toContain('as soon as possible');
    });

    it('names the day and time for a scheduled session', async () => {
      const t1 = await trainer(T1, 'Asha');
      const startsAt = slot(3);
      const addressId = await address();
      const id = (await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId, startsAt, idempotencyKey: key() }).expect(201)).body.id as string;
      await app.get(DispatchService).runOnce();
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t1.token)).expect(200);
      const note = ((await http().get('/v1/notifications').set(as(me)).expect(200)).body as { title: string; body: string }[]).find((x) => x.title === 'Coach assigned')!;
      expect(note.body).toMatch(/will arrive at Bandra West on .*6:00 PM/);
    });
  });

  describe('Needs attention', () => {
    it('lists a booking nobody has accepted, and a trainer cancellation as urgent', async () => {
      const owner = await adminToken('owner-attn@zoove.test', true, []);
      expect((await http().get('/v1/admin/attention').set(as(owner)).expect(200)).body).toMatchObject({ total: 0, groups: [] });
      const t1 = await trainer(T1, 'Asha');
      const id = await bookInstant();
      let body = (await http().get('/v1/admin/attention').set(as(owner)).expect(200)).body;
      expect(body.groups.map((g: { key: string }) => g.key)).toEqual(['no_trainer']);
      expect(body.groups[0].items[0].id).toBe(id);
      expect(body.urgent).toBe(0);
      await app.get(DispatchService).runOnce();
      await http().post(`/v1/trainer/jobs/${id}/accept`).set(as(t1.token)).expect(200);
      await http().post(`/v1/trainer/jobs/${id}/cancel`).set(as(t1.token)).send({ reason: 'Not well today' }).expect(200);
      body = (await http().get('/v1/admin/attention').set(as(owner)).expect(200)).body;
      expect(body.groups.map((g: { key: string }) => g.key)).toEqual(['trainer_cancelled']);
      expect(body.urgent).toBe(1);
    });

    it('shows each admin only the groups they may handle', async () => {
      const parties = await adminToken('parties-attn@zoove.test', false, ['parties.manage']);
      await bookInstant();
      const body = (await http().get('/v1/admin/attention').set(as(parties)).expect(200)).body;
      expect(body.groups.find((g: { key: string }) => g.key === 'no_trainer')).toBeUndefined();
    });

    it('is closed to customers and to people who are not on the admin team', async () => {
      await http().get('/v1/admin/attention').set(as(me)).expect(403);
      await http().get('/v1/admin/attention').expect(401);
    });
  });
});
