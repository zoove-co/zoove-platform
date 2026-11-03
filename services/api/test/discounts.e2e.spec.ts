import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { CODE, signIn, startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const OWNER = 'owner-discounts@zoove.test';
const ME = '+919876543210';
const OTHER = '+919812345678';
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number) => new Date(`${isoDate(days)}T18:00:00+05:30`).toISOString();
const SCHEDULED = 150_000; // price of a scheduled session in the seed data

suite('discount codes', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let owner: string;
  let me: string;
  let other: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  const makeCode = (body: object) => http().post('/v1/admin/discount-codes').set(as(owner)).send({ reason: 'goodwill', ...body });
  const preview = (t: string, code: string, mode = 'scheduled') => http().post('/v1/discounts/preview').set(as(t)).send({ code, serviceSlug: 'yoga', mode });
  async function addressFor(t: string) {
    return (await http().post('/v1/addresses').set(as(t)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
  }
  const book = (t: string, addressId: string, day: number, discountCode?: string) =>
    http().post('/v1/bookings').set(as(t)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId, startsAt: slot(day), discountCode, idempotencyKey: `disc-key-${Date.now()}-${(n += 1)}` });

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
    await pool.query('truncate table discount_attempts, discount_redemptions, discount_codes, customer_notifications, otp_challenges, refresh_tokens, admin_profiles, user_roles, users, outbox_events, audit_log cascade');
    me = await signIn(app, pool, ME);
    other = await signIn(app, pool, OTHER);
    const admin = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [OWNER]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [admin.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner) values ($1, 'Ritesh', 'Owner', true)`, [admin.rows[0]!.id]);
    await http().post('/v1/auth/email-otp/request').send({ email: OWNER, audience: 'admin' }).expect(200);
    owner = (await http().post('/v1/auth/email-otp/verify').send({ email: OWNER, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  });

  it('needs sign-in, and the admin side needs the discounts permission', async () => {
    await http().post('/v1/discounts/preview').send({}).expect(401);
    await http().get('/v1/admin/discount-codes').set(as(me)).expect(403);
    await http().post('/v1/admin/discount-codes').send({}).expect(401);
  });

  it('an admin makes a 50% code and the customer pays half at checkout; it is recorded on the booking', async () => {
    const made = (await makeCode({ kind: 'percent', percentOff: 50, reason: 'emergency', note: 'Trainer did not turn up' }).expect(201)).body;
    expect(made.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(made).toMatchObject({ percentOff: 50, status: 'active', used: 0, reason: 'emergency' });

    const quote = (await preview(me, made.code.toLowerCase()).expect(200)).body;
    expect(quote).toMatchObject({ label: '50% off', listPaise: SCHEDULED, discountPaise: SCHEDULED / 2, totalPaise: SCHEDULED / 2 });
    // A preview uses nothing up.
    expect((await pool.query(`select redemption_count from discount_codes`)).rows[0].redemption_count).toBe(0);

    const address = await addressFor(me);
    const booked = (await book(me, address, 3, made.code).expect(201)).body;
    expect(booked).toMatchObject({ totalPaise: SCHEDULED / 2, discountPaise: SCHEDULED / 2, discountCode: made.code });
    expect((await http().get('/v1/admin/discount-codes').set(as(owner)).expect(200)).body[0]).toMatchObject({ used: 1, status: 'used_up' });
    expect((await pool.query(`select action from audit_log where action = 'discount.created'`)).rows).toHaveLength(1);
  });

  it('a retry with the same key does not use the code twice, and a used code cannot be used again', async () => {
    const code = (await makeCode({ kind: 'flat', flatOffPaise: 20_000 }).expect(201)).body.code as string;
    const address = await addressFor(me);
    const key = 'disc-retry-0001';
    const send = () => http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId: address, startsAt: slot(3), discountCode: code, idempotencyKey: key });
    const first = (await send().expect(201)).body;
    const again = (await send().expect(201)).body;
    expect(again.id).toBe(first.id);
    expect(first.totalPaise).toBe(SCHEDULED - 20_000);
    expect((await pool.query(`select redemption_count from discount_codes`)).rows[0].redemption_count).toBe(1);

    const second = await book(me, address, 4, code).expect(422);
    expect(second.body.error.code).toBe('DISCOUNT_USED');
    // The refused booking was not created.
    expect((await pool.query(`select count(*)::int as n from bookings`)).rows[0].n).toBe(1);
  });

  it('cancelling gives the code back', async () => {
    const code = (await makeCode({ kind: 'percent', percentOff: 10 }).expect(201)).body.code as string;
    const address = await addressFor(me);
    const booked = (await book(me, address, 3, code).expect(201)).body;
    await http().post(`/v1/bookings/${booked.id}/cancel`).set(as(me)).expect(201);
    expect((await pool.query(`select redemption_count from discount_codes`)).rows[0].redemption_count).toBe(0);
    const again = (await book(me, address, 4, code).expect(201)).body;
    expect(again.discountPaise).toBe(SCHEDULED / 10);
  });

  it('a code for one customer does not work for anyone else, and looks like an unknown code', async () => {
    const mine = (await makeCode({ kind: 'percent', percentOff: 30, customerEmail: 'someone@example.com' }).expect(404)).body;
    expect(mine.error.code).toBe('NOT_FOUND');
    await pool.query(`update users set email = 'meme@example.com' where phone_e164 = $1`, [ME]);
    const code = (await makeCode({ kind: 'percent', percentOff: 30, customerEmail: 'MeMe@example.com' }).expect(201)).body;
    expect(code.customerEmail).toBe('meme@example.com');
    expect((await preview(me, code.code).expect(200)).body.discountPaise).toBe(45_000);
    expect((await preview(other, code.code).expect(422)).body.error.code).toBe('DISCOUNT_INVALID');
    expect((await preview(other, 'NOSUCHCODE').expect(422)).body.error.code).toBe('DISCOUNT_INVALID');
    // The customer is told about it in the app.
    const notes = await http().get('/v1/notifications').set(as(me)).expect(200);
    expect(JSON.stringify(notes.body)).toContain(code.code);
  });

  it('applies caps, minimum order, expiry, switching off and what the code is for', async () => {
    const capped = (await makeCode({ kind: 'percent', percentOff: 50, maxDiscountPaise: 30_000 }).expect(201)).body.code as string;
    expect((await preview(me, capped).expect(200)).body.discountPaise).toBe(30_000);

    const tooSmall = (await makeCode({ kind: 'flat', flatOffPaise: 10_000, minOrderPaise: 200_000 }).expect(201)).body.code as string;
    expect((await preview(me, tooSmall).expect(422)).body.error.code).toBe('DISCOUNT_NOT_APPLICABLE');

    const packagesOnly = (await makeCode({ kind: 'percent', percentOff: 10, appliesTo: 'package' }).expect(201)).body.code as string;
    expect((await preview(me, packagesOnly).expect(422)).body.error.code).toBe('DISCOUNT_NOT_APPLICABLE');

    const free = (await makeCode({ kind: 'percent', percentOff: 100 }).expect(201)).body;
    expect((await preview(me, free.code).expect(200)).body.totalPaise).toBe(0);
    const huge = (await makeCode({ kind: 'flat', flatOffPaise: 9_000_000 }).expect(201)).body.code as string;
    expect((await preview(me, huge).expect(200)).body).toMatchObject({ discountPaise: SCHEDULED, totalPaise: 0 });

    const expiring = (await makeCode({ kind: 'percent', percentOff: 10 }).expect(201)).body;
    await pool.query(`update discount_codes set valid_from = now() - interval '2 days', expires_at = now() - interval '1 day' where id = $1`, [expiring.id]);
    expect((await preview(me, expiring.code).expect(422)).body.error.code).toBe('DISCOUNT_EXPIRED');

    const off = (await makeCode({ kind: 'percent', percentOff: 10 }).expect(201)).body;
    const disabled = (await http().post(`/v1/admin/discount-codes/${off.id}/disable`).set(as(owner)).expect(200)).body;
    expect(disabled.status).toBe('disabled');
    expect((await preview(me, off.code).expect(422)).body.error.code).toBe('DISCOUNT_INVALID');
  });

  it('a made-up code can be chosen, but not twice, and bad settings are refused', async () => {
    await makeCode({ kind: 'percent', percentOff: 20, code: 'welcome20' }).expect(201).then((r) => expect(r.body.code).toBe('WELCOME20'));
    expect((await makeCode({ kind: 'percent', percentOff: 20, code: 'WELCOME20' }).expect(400)).body.error.code).toBe('INVALID_REQUEST');
    for (const bad of [
      { kind: 'percent' },
      { kind: 'percent', percentOff: 0 },
      { kind: 'percent', percentOff: 101 },
      { kind: 'flat' },
      { kind: 'flat', flatOffPaise: 5_000, percentOff: 10 },
      { kind: 'percent', percentOff: 10, code: 'a b' },
      { kind: 'percent', percentOff: 10, maxRedemptions: 1, perUserLimit: 2 },
      { kind: 'percent', percentOff: 10, expiresAt: new Date(Date.now() - 1000).toISOString() },
    ]) {
      expect((await makeCode(bad).expect(400)).body.error.code).toBe('INVALID_REQUEST');
    }
  });

  it('stops a customer who keeps guessing', async () => {
    for (let i = 0; i < 10; i += 1) await preview(me, `WRONG${i}XX`).expect(422);
    expect((await preview(me, 'WRONGAGAIN').expect(429)).body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
