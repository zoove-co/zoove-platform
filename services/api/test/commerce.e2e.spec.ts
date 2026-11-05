import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { CODE, signIn, startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const OWNER = 'owner-commerce@zoove.test';
const ME = '+919876543210';
const OTHER = '+919812345678';
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number) => new Date(`${isoDate(days)}T18:00:00+05:30`).toISOString();
const SCHEDULED = 150_000;

suite('packages, party, referral, progress profile, Duo/Group prices', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let owner: string;
  let me: string;
  let other: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = () => `commerce-key-${Date.now()}-${(n += 1)}`;
  async function addressFor(t: string) {
    return (await http().post('/v1/addresses').set(as(t)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
  }
  const book = (t: string, addressId: string, day: number, extra: object = {}) =>
    http().post('/v1/bookings').set(as(t)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId, startsAt: slot(day), idempotencyKey: key(), ...extra });

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string));
    await pool.query(`update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar'`);
  });
  afterAll(async () => {
    await pool.query(`update clusters set status = 'locked', activated_at = null where slug = 'bandra-khar'`);
    await pool.query(`delete from packages where name like 'Test pack%'`);
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query('truncate table package_purchases, party_requests, referrals, referral_codes, discount_attempts, discount_redemptions, discount_codes, customer_notifications, otp_challenges, refresh_tokens, admin_profiles, user_roles, users, outbox_events, audit_log cascade');
    me = await signIn(app, pool, ME);
    other = await signIn(app, pool, OTHER);
    const admin = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [OWNER]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [admin.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner) values ($1, 'Ritesh', 'Owner', true)`, [admin.rows[0]!.id]);
    await http().post('/v1/auth/email-otp/request').send({ email: OWNER, audience: 'admin' }).expect(200);
    owner = (await http().post('/v1/auth/email-otp/verify').send({ email: OWNER, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  });

  it('prices Duo, Group (per person) and Loved one from the placeholder rules, and the catalog shows the rules', async () => {
    const catalog = (await http().get('/v1/services').expect(200)).body;
    expect(catalog[0].participantRules).toMatchObject({ duo: { percent: 160, perHead: false }, group: { percent: 70, perHead: true }, loved_one: { percent: 100, perHead: false } });
    const address = await addressFor(me);
    expect((await book(me, address, 3, { participant: 'duo' }).expect(201)).body.totalPaise).toBe(240_000);
    expect((await book(me, address, 4, { participant: 'group', groupSize: 5 }).expect(201)).body.totalPaise).toBe(525_000);
    expect((await book(me, address, 5, { participant: 'loved_one', recipient: { name: 'Asha Rao', phone: '+919811111111' } }).expect(201)).body.totalPaise).toBe(SCHEDULED);
    expect((await book(me, address, 6).expect(201)).body.totalPaise).toBe(SCHEDULED);
  });

  describe('packages and credits', () => {
    const buy = (t: string, packageId: string, extra: object = {}, k = key()) => http().post('/v1/me/packages').set(as(t)).send({ packageId, idempotencyKey: k, ...extra });
    const firstPackage = async () => (await http().get('/v1/packages').set(as(me)).expect(200)).body[0] as { id: string; sessionsCount: number; pricePaise: number };

    it('an order waits for payment, ops mark it paid, then credits pay for sessions and come back on cancel', async () => {
      const list = (await http().get('/v1/packages').set(as(me)).expect(200)).body;
      expect(list.length).toBeGreaterThanOrEqual(3);
      const pkg = await firstPackage();
      const k = key();
      const order = (await buy(me, pkg.id, {}, k).expect(201)).body;
      expect(order).toMatchObject({ status: 'awaiting_payment', totalPaise: pkg.pricePaise, creditsLeft: 0 });
      expect((await buy(me, pkg.id, {}, k).expect(201)).body.id).toBe(order.id); // retry: same order
      expect((await pool.query(`select count(*)::int as c from package_purchases`)).rows[0].c).toBe(1);

      const address = await addressFor(me);
      await book(me, address, 3, { useCredit: true }).expect(409); // nothing paid yet

      await http().post(`/v1/admin/package-orders/${order.id}/mark-paid`).set(as(me)).send({ method: 'upi', reference: 'UPI123' }).expect(403);
      const paid = (await http().post(`/v1/admin/package-orders/${order.id}/mark-paid`).set(as(owner)).send({ method: 'upi', reference: 'UPI123' }).expect(200)).body;
      expect(paid).toMatchObject({ status: 'paid', creditsLeft: pkg.sessionsCount });
      expect(paid.expiresAt).not.toBeNull();
      await http().post(`/v1/admin/package-orders/${order.id}/mark-paid`).set(as(owner)).send({ method: 'upi', reference: 'UPI123' }).expect(200); // twice changes nothing
      expect((await http().get('/v1/me/packages').set(as(me)).expect(200)).body.credits.creditsLeft).toBe(pkg.sessionsCount);

      const booked = (await book(me, address, 3, { useCredit: true }).expect(201)).body;
      expect(booked).toMatchObject({ totalPaise: 0, paidWithCredit: true });
      expect((await http().get('/v1/me/packages').set(as(me)).expect(200)).body.credits.creditsLeft).toBe(pkg.sessionsCount - 1);
      await http().post(`/v1/bookings/${booked.id}/cancel`).set(as(me)).expect(201);
      expect((await http().get('/v1/me/packages').set(as(me)).expect(200)).body.credits.creditsLeft).toBe(pkg.sessionsCount);
      // The other customer cannot touch it.
      await http().post(`/v1/me/packages/${order.id}/cancel`).set(as(other)).expect(404);
      await book(me, address, 4, { useCredit: true, discountCode: 'ABCD1234' }).expect(400);
    });

    it('a package discount code lowers the order, and cancelling an unpaid order gives the code back', async () => {
      const made = (await http().post('/v1/admin/discount-codes').set(as(owner)).send({ kind: 'percent', percentOff: 50, reason: 'promo', appliesTo: 'package' }).expect(201)).body;
      const pkg = await firstPackage();
      const order = (await buy(me, pkg.id, { discountCode: made.code }).expect(201)).body;
      expect(order).toMatchObject({ totalPaise: pkg.pricePaise / 2, discountPaise: pkg.pricePaise / 2 });
      expect((await http().get('/v1/admin/discount-codes').set(as(owner)).expect(200)).body[0].used).toBe(1);
      await http().post(`/v1/me/packages/${order.id}/cancel`).set(as(me)).expect(200);
      expect((await http().get('/v1/admin/discount-codes').set(as(owner)).expect(200)).body[0].used).toBe(0);
      const sessionOnly = (await http().post('/v1/admin/discount-codes').set(as(owner)).send({ kind: 'percent', percentOff: 10, reason: 'promo', appliesTo: 'session' }).expect(201)).body;
      await buy(me, pkg.id, { discountCode: sessionOnly.code }).expect(422);
    });

    it('lists orders for ops, unpaid first, and edits a package', async () => {
      const pkg = await firstPackage();
      await buy(me, pkg.id).expect(201);
      const created = (await http().post('/v1/admin/packages').set(as(owner)).send({ name: 'Test pack', sessionsCount: 2, pricePaise: 300_000, isActive: true }).expect(201)).body;
      const rows = (await http().get('/v1/admin/package-orders').set(as(owner)).expect(200)).body;
      expect(rows[0]).toMatchObject({ status: 'awaiting_payment' });
      const edited = (await http().post(`/v1/admin/packages/${created.id}`).set(as(owner)).send({ name: 'Test pack 2', sessionsCount: 2, pricePaise: 250_000, originalPricePaise: 300_000, validityDays: 60, isActive: false }).expect(200)).body;
      expect(edited).toMatchObject({ name: 'Test pack 2', pricePaise: 250_000 });
      expect((await http().get('/v1/packages').set(as(me)).expect(200)).body.map((x: { id: string }) => x.id)).not.toContain(created.id); // switched off
      await http().post('/v1/admin/packages').set(as(owner)).send({ name: 'Bad', sessionsCount: 2, pricePaise: 500_000, originalPricePaise: 100, isActive: true }).expect(400);
    });
  });

  describe('party requests', () => {
    const party = (t: string, addressId: string, extra: object = {}, k = key()) =>
      http().post('/v1/party-requests').set(as(t)).send({ occasion: 'birthday', serviceSlug: 'zumba', guests: 8, startsAt: slot(5), addressId, contactPhone: '+919822222222', contactName: 'Meera', idempotencyKey: k, ...extra });

    it('is submitted with date, time and place; the team is told; ops confirm; the customer hears back', async () => {
      const address = await addressFor(me);
      const k = key();
      const made = (await party(me, address, {}, k).expect(201)).body;
      expect(made).toMatchObject({ status: 'new', guests: 8, occasion: 'birthday' });
      expect((await party(me, address, {}, k).expect(201)).body.id).toBe(made.id);
      expect((await pool.query(`select count(*)::int as c from party_requests`)).rows[0].c).toBe(1);
      const event = (await pool.query(`select payload from outbox_events where event_type = 'party.requested'`)).rows;
      expect(event).toHaveLength(1);
      expect(event[0].payload).toMatchObject({ name: 'Meera', guests: 8, phone: '+919822222222' });
      expect((await http().get('/v1/notifications').set(as(me)).expect(200)).body[0].title).toBe('Party request received');

      await http().get('/v1/admin/party-requests').set(as(me)).expect(403);
      const list = (await http().get('/v1/admin/party-requests').set(as(owner)).expect(200)).body;
      expect(list[0]).toMatchObject({ id: made.id, status: 'new', contactPhone: '+919822222222', customer: 'Meera' });
      expect(list[0].address).toContain('Bandra West');
      const done = (await http().post(`/v1/admin/party-requests/${made.id}/status`).set(as(owner)).send({ status: 'confirmed', adminNote: 'Called, 6pm ok' }).expect(200)).body;
      expect(done).toMatchObject({ status: 'confirmed', adminNote: 'Called, 6pm ok', handledBy: 'Ritesh' });
      expect((await http().get('/v1/notifications').set(as(me)).expect(200)).body[0].title).toBe('Party confirmed');
      expect((await http().get('/v1/party-requests').set(as(me)).expect(200)).body[0].status).toBe('confirmed');
    });

    it('rejects a bad phone, a date that is too soon, an unknown activity and someone else\'s address', async () => {
      const address = await addressFor(me);
      await party(me, address, { contactPhone: '12345' }).expect(400);
      await party(me, address, { startsAt: new Date(Date.now() + 3600_000).toISOString() }).expect(409);
      await party(me, address, { serviceSlug: 'nope' }).expect(404);
      await party(other, address).expect(404);
      await party(me, address, { guests: 1 }).expect(400);
    });
  });

  describe('referral', () => {
    it('gives each customer one code; a friend applies it once; the booking marks it booked', async () => {
      const mine = (await http().get('/v1/referral').set(as(me)).expect(200)).body;
      expect(mine.code).toMatch(/^[A-Z2-9]{8}$/);
      expect((await http().get('/v1/referral').set(as(me)).expect(200)).body.code).toBe(mine.code);
      await http().post('/v1/referral/apply').set(as(me)).send({ code: mine.code }).expect(400); // not your own
      await http().post('/v1/referral/apply').set(as(other)).send({ code: 'ZZZZZZZZ' }).expect(404);
      await http().post('/v1/referral/apply').set(as(other)).send({ code: mine.code.toLowerCase() }).expect(200);
      await http().post('/v1/referral/apply').set(as(other)).send({ code: mine.code }).expect(409); // only once
      expect((await http().get('/v1/referral').set(as(me)).expect(200)).body).toMatchObject({ signedUp: 1, booked: 0 });
      await book(other, await addressFor(other), 3).expect(201);
      expect((await http().get('/v1/referral').set(as(me)).expect(200)).body).toMatchObject({ signedUp: 1, booked: 1 });
      expect((await http().get('/v1/referral').set(as(other)).expect(200)).body.referredBy).toBe(true);
    });

    it('does not accept a code after the customer has already booked', async () => {
      const mine = (await http().get('/v1/referral').set(as(me)).expect(200)).body;
      await book(other, await addressFor(other), 3).expect(201);
      await http().post('/v1/referral/apply').set(as(other)).send({ code: mine.code }).expect(409);
    });
  });

  describe('progress profile', () => {
    it('keeps height and weight only with consent, and the weekly goal follows the days a week', async () => {
      expect((await http().get('/v1/me/progress-profile').set(as(me)).expect(200)).body).toMatchObject({ goal: null, healthConsent: false });
      await http().put('/v1/me/progress-profile').set(as(me)).send({ goal: 'build_strength', targetDaysPerWeek: 4, heightCm: 170, healthConsent: false }).expect(422);
      const saved = (await http().put('/v1/me/progress-profile').set(as(me)).send({ goal: 'build_strength', targetDaysPerWeek: 4, heightCm: 170, weightKg: 65.5, healthConsent: true }).expect(200)).body;
      expect(saved).toEqual({ goal: 'build_strength', targetDaysPerWeek: 4, heightCm: 170, weightKg: 65.5, healthConsent: true });
      expect((await http().get('/v1/streak').set(as(me)).expect(200)).body.weeklyGoal).toBe(4);
      expect((await http().get('/v1/home').set(as(me)).expect(200)).body.weekly.goal).toBe(4);
      const withdrawn = (await http().put('/v1/me/progress-profile').set(as(me)).send({ goal: 'build_strength', targetDaysPerWeek: 4, healthConsent: false }).expect(200)).body;
      expect(withdrawn).toMatchObject({ heightCm: null, weightKg: null, healthConsent: false, targetDaysPerWeek: 4 });
      expect((await pool.query(`select height_cm, weight_kg from customer_profiles`)).rows[0]).toEqual({ height_cm: null, weight_kg: null });
      expect((await pool.query(`select accepted from consents where kind = 'health_data' order by recorded_at`)).rows.map((r) => r.accepted)).toEqual([true, false]);
    });
  });

  it('deleting an account wipes party contact details, the referral code and unpaid package orders', async () => {
    const address = await addressFor(me);
    await http().post('/v1/party-requests').set(as(me)).send({ occasion: 'team', serviceSlug: 'yoga', guests: 5, startsAt: slot(6), addressId: address, contactPhone: '+919822222222', idempotencyKey: key() }).expect(201);
    await http().get('/v1/referral').set(as(me)).expect(200);
    const pkg = (await http().get('/v1/packages').set(as(me)).expect(200)).body[0];
    await http().post('/v1/me/packages').set(as(me)).send({ packageId: pkg.id, idempotencyKey: key() }).expect(201);
    await http().delete('/v1/me').set(as(me)).expect(204);
    expect((await pool.query(`select contact_phone, address_line from party_requests`)).rows[0]).toEqual({ contact_phone: null, address_line: 'Deleted' });
    expect((await pool.query(`select count(*)::int as c from referral_codes`)).rows[0].c).toBe(0);
    expect((await pool.query(`select status from package_purchases`)).rows[0].status).toBe('cancelled');
  });
});
