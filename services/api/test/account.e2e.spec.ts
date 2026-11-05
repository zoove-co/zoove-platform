import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { CODE, signIn, startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number) => new Date(`${isoDate(days)}T18:00:00+05:30`).toISOString();

suite('consent at sign-in and deleting an account', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const age = (email: string) => pool.query(`update otp_challenges set created_at = created_at - interval '2 minutes' where email = $1`, [email]);

  async function emailLogin(email: string, acceptedTerms?: boolean) {
    await age(email);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'customer' }).expect(200);
    return http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'customer', acceptedTerms });
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
    await pool.query('truncate table consents, customer_notifications, otp_challenges, refresh_tokens, user_roles, users, outbox_events, audit_log cascade');
  });

  it('a new customer must agree to the Terms; the code is not used up, and the agreement is recorded with its version', async () => {
    const refused = await emailLogin('new@example.com');
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('CONSENT_REQUIRED');
    expect((await pool.query(`select 1 from users where verified_email = 'new@example.com'`)).rows).toHaveLength(0);

    // Same code again, now agreed.
    const ok = await http().post('/v1/auth/email-otp/verify').send({ email: 'new@example.com', code: CODE, audience: 'customer', acceptedTerms: true }).expect(200);
    expect(ok.body.isNewUser).toBe(true);
    const rows = await pool.query(`select kind, version, accepted from consents order by kind`);
    expect(rows.rows).toEqual([
      { kind: 'privacy', version: '2026-11-06', accepted: true },
      { kind: 'terms', version: '2026-11-06', accepted: true },
    ]);
  });

  it('a returning customer is not asked again, and signing in twice does not repeat the record', async () => {
    await emailLogin('back@example.com', true).then((r) => expect(r.status).toBe(200));
    const again = await emailLogin('back@example.com');
    expect(again.status).toBe(200);
    await emailLogin('back@example.com', true).then((r) => expect(r.status).toBe(200));
    expect((await pool.query(`select count(*)::int as n from consents`)).rows[0].n).toBe(2);
  });

  it('deleting wipes personal details, ends every sign-in, keeps the order history, and frees the email', async () => {
    const login = (await emailLogin('gone@example.com', true)).body;
    const token = login.token as string;
    await http().patch('/v1/me').set(as(token)).send({ firstName: 'Gone', lastName: 'Person' }).expect(200);
    const address = (await http().post('/v1/addresses').set(as(token)).send({ label: 'Home', line: '12 Test Road', area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
    const booking = (await http().post('/v1/bookings').set(as(token)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', participant: 'loved_one', recipient: { name: 'Asha Rao', phone: '+919876543210' }, addressId: address, startsAt: slot(3), idempotencyKey: 'delete-key-0001' }).expect(201)).body.id as string;

    // Refused while a session is upcoming.
    const blocked = await http().delete('/v1/me').set(as(token)).expect(409);
    expect(blocked.body.error.code).toBe('HAS_ACTIVE_BOOKINGS');
    await http().get('/v1/me').set(as(token)).expect(200);

    await http().post(`/v1/bookings/${booking}/cancel`).set(as(token)).expect(201);
    await http().delete('/v1/me').set(as(token)).expect(204);

    // Signed out everywhere at once.
    await http().get('/v1/me').set(as(token)).expect(401);
    await http().post('/v1/auth/refresh').send({ refreshToken: login.refreshToken }).expect(401);

    const user = (await pool.query(`select status, phone_e164, email, verified_email, first_name, last_name from users`)).rows;
    expect(user).toEqual([{ status: 'deleted', phone_e164: null, email: null, verified_email: null, first_name: null, last_name: null }]);
    const kept = (await pool.query(`select status, address_line, recipient_name, recipient_phone from bookings`)).rows;
    expect(kept).toEqual([{ status: 'cancelled', address_line: 'Deleted', recipient_name: null, recipient_phone: null }]);
    expect((await pool.query(`select line1, latitude from addresses`)).rows).toEqual([{ line1: 'Deleted', latitude: null }]);
    expect((await pool.query(`select action from audit_log`)).rows).toEqual([{ action: 'customer.account_deleted' }]);

    // The same email can start over as a brand-new customer.
    const fresh = await emailLogin('gone@example.com', true);
    expect(fresh.status).toBe(200);
    expect(fresh.body.isNewUser).toBe(true);
  });

  it('refuses to delete a trainer or admin from the customer app, and needs sign-in', async () => {
    await http().delete('/v1/me').expect(401);
    const token = await signIn(app, pool, '+919876500001');
    await pool.query(`insert into user_roles (user_id, role) select id, 'admin' from users where phone_e164 = '+919876500001'`);
    expect((await http().delete('/v1/me').set(as(token)).expect(403)).body.error.code).toBe('FORBIDDEN');
  });
});
