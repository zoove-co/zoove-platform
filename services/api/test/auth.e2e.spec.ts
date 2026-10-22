import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

// These tests need a Postgres with the migrations applied (supabase/migrations/*.sql and seed.sql).
// Set TEST_DATABASE_URL to run them; without it they are skipped so `pnpm test` works anywhere.
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const PHONE = '+919876543210';
const OTHER = '+919812345678';
const CODE = '123456';

suite('API against a real database', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = url;
    process.env.JWT_SECRET = 'j'.repeat(40);
    process.env.OTP_SECRET = 'o'.repeat(40);
    process.env.DEV_FIXED_OTP = CODE;
    process.env.OTP_RESEND_SECONDS = '30';

    pool = new Pool({ connectionString: url });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate table otp_challenges, refresh_tokens, user_roles, users cascade');
  });

  const requestCode = (phone = PHONE) => http().post('/v1/auth/otp/request').send({ phone });
  const verify = (code = CODE, phone = PHONE) => http().post('/v1/auth/otp/verify').send({ phone, code });
  // Pretend the last code was asked a while ago, so the resend wait is over.
  const ageCodes = () => pool.query(`update otp_challenges set created_at = created_at - interval '2 minutes'`);

  async function signIn(phone = PHONE) {
    await requestCode(phone).expect(200);
    const response = await verify(CODE, phone).expect(200);
    return response.body as { token: string; refreshToken: string; isNewUser: boolean; expiresInSeconds: number };
  }

  describe('health', () => {
    it('is alive and ready', async () => {
      await http().get('/health').expect(200, { status: 'ok' });
      await http().get('/health/ready').expect(200, { status: 'ok' });
    });
  });

  describe('sign in', () => {
    it('creates a customer on first login and signs in again later', async () => {
      const first = await signIn();
      expect(first.isNewUser).toBe(true);
      expect(first.token).toBeTruthy();
      expect(first.refreshToken.length).toBeGreaterThan(20);
      expect(first.expiresInSeconds).toBe(900);

      await ageCodes();
      const second = await signIn();
      expect(second.isNewUser).toBe(false);

      const users = await pool.query('select count(*)::int as n from users');
      expect(users.rows[0].n).toBe(1);
      const roles = await pool.query(`select role from user_roles`);
      expect(roles.rows).toEqual([{ role: 'customer' }]);
    });

    it('stores only a hash of the code and of the refresh token', async () => {
      const tokens = await signIn();
      const challenge = await pool.query('select code_hash from otp_challenges');
      expect(challenge.rows[0].code_hash).not.toContain(CODE);
      const stored = await pool.query('select token_hash from refresh_tokens');
      expect(stored.rows[0].token_hash).not.toBe(tokens.refreshToken);
    });

    it('rejects a phone that is not an Indian mobile number', async () => {
      const response = await requestCode('+14155550123').expect(400);
      expect(response.body.error.code).toBe('INVALID_PHONE');
      await requestCode('9876543210').expect(400);
    });

    it('rejects a malformed code before touching the database', async () => {
      const response = await verify('abc').expect(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });

    it('answers a code that was never requested with OTP_INVALID', async () => {
      const response = await verify().expect(400);
      expect(response.body.error.code).toBe('OTP_INVALID');
    });

    it('makes the customer wait before asking for another code', async () => {
      await requestCode().expect(200, { resendAfterSeconds: 30 });
      const response = await requestCode().expect(429);
      expect(response.body.error.code).toBe('OTP_RATE_LIMITED');
      expect(response.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('caps codes per hour', async () => {
      for (let i = 0; i < 5; i += 1) {
        await requestCode().expect(200);
        await ageCodes();
      }
      const response = await requestCode().expect(429);
      expect(response.body.error.code).toBe('OTP_RATE_LIMITED');
    });

    it('counts wrong codes and locks after five', async () => {
      await requestCode().expect(200);
      for (let i = 0; i < 4; i += 1) {
        const wrong = await verify('000000').expect(400);
        expect(wrong.body.error.code).toBe('OTP_INVALID');
      }
      const fifth = await verify('000000').expect(429);
      expect(fifth.body.error.code).toBe('OTP_LOCKED');
      // Even the right code no longer works: the customer must ask for a new one.
      const right = await verify().expect(429);
      expect(right.body.error.code).toBe('OTP_LOCKED');

      await ageCodes();
      await requestCode().expect(200);
      await verify().expect(200);
    });

    it('does not accept an expired code', async () => {
      await requestCode().expect(200);
      await pool.query(`update otp_challenges set expires_at = now() - interval '1 second'`);
      const response = await verify().expect(400);
      expect(response.body.error.code).toBe('OTP_INVALID');
    });

    it('does not accept a code twice', async () => {
      await requestCode().expect(200);
      await verify().expect(200);
      await verify().expect(400);
    });

    it('lets only one of two simultaneous requests use a code', async () => {
      await requestCode().expect(200);
      const [a, b] = await Promise.all([verify(), verify()]);
      expect([a.status, b.status].sort()).toEqual([200, 400]);
    });

    it('keeps a code private to its phone number', async () => {
      await requestCode(PHONE).expect(200);
      const response = await verify(CODE, OTHER).expect(400);
      expect(response.body.error.code).toBe('OTP_INVALID');
    });

    it('stops a blocked customer at once, even with a token that has not expired', async () => {
      const { token } = await signIn();
      await http().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
      await pool.query(`update users set status = 'blocked'`);
      const r = await http().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(401);
      expect(r.body.error.code).toBe('UNAUTHORIZED');
    });

    it('refuses a blocked account', async () => {
      await signIn();
      await pool.query(`update users set status = 'blocked'`);
      await ageCodes();
      await requestCode().expect(200);
      const response = await verify().expect(403);
      expect(response.body.error.code).toBe('ACCOUNT_BLOCKED');
    });
  });

  describe('profile', () => {
    it('needs a valid access token', async () => {
      const missing = await http().get('/v1/me').expect(401);
      expect(missing.body.error.code).toBe('UNAUTHORIZED');
      await http().get('/v1/me').set('Authorization', 'Bearer not-a-token').expect(401);
    });

    it('reads and updates the profile', async () => {
      const { token } = await signIn();
      const empty = await http().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(empty.body).toEqual({ phone: PHONE, firstName: null, lastName: null, email: null });

      const updated = await http()
        .patch('/v1/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: '  Ritesh ', lastName: 'Sharma', email: 'ritesh@example.com' })
        .expect(200);
      expect(updated.body).toEqual({ phone: PHONE, firstName: 'Ritesh', lastName: 'Sharma', email: 'ritesh@example.com' });
    });

    it('updates only what is sent, and an empty value clears it', async () => {
      const { token } = await signIn();
      const auth = { Authorization: `Bearer ${token}` };
      await http().patch('/v1/me').set(auth).send({ firstName: 'Ritesh', lastName: 'Sharma' }).expect(200);
      const emailOnly = await http().patch('/v1/me').set(auth).send({ email: 'only@example.com' }).expect(200);
      expect(emailOnly.body).toEqual({ phone: PHONE, firstName: 'Ritesh', lastName: 'Sharma', email: 'only@example.com' });
      const cleared = await http().patch('/v1/me').set(auth).send({ email: '', lastName: '' }).expect(200);
      expect(cleared.body).toEqual({ phone: PHONE, firstName: 'Ritesh', lastName: null, email: null });
      await http().patch('/v1/me').set(auth).send({}).expect(400);
    });

    it('validates the update', async () => {
      const { token } = await signIn();
      const auth = { Authorization: `Bearer ${token}` };
      await http().patch('/v1/me').set(auth).send({ firstName: 'R' }).expect(400);
      await http().patch('/v1/me').set(auth).send({ firstName: 'Ritesh', email: 'nope' }).expect(400);
    });

    it('does not let two customers share an email', async () => {
      const a = await signIn(PHONE);
      await ageCodes();
      const b = await signIn(OTHER);
      await http().patch('/v1/me').set('Authorization', `Bearer ${a.token}`).send({ firstName: 'Anya', email: 'same@example.com' }).expect(200);
      const clash = await http().patch('/v1/me').set('Authorization', `Bearer ${b.token}`).send({ firstName: 'Bela', email: 'SAME@example.com' }).expect(409);
      expect(clash.body.error.code).toBe('EMAIL_TAKEN');
    });
  });

  describe('refresh tokens', () => {
    it('rotates: each refresh token works once', async () => {
      const first = await signIn();
      const second = await http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
      expect(second.body.refreshToken).not.toBe(first.refreshToken);
      await http().get('/v1/me').set('Authorization', `Bearer ${second.body.token}`).expect(200);
    });

    it('treats a reused token as theft and ends every session', async () => {
      const first = await signIn();
      const second = await http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200);
      // The old token comes back (an attacker, or a replayed request).
      await http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      // The newest token was issued from the same session, so it is dead too.
      await http().post('/v1/auth/refresh').send({ refreshToken: second.body.refreshToken }).expect(401);
    });

    it('rejects an unknown or expired token', async () => {
      await http().post('/v1/auth/refresh').send({ refreshToken: 'x'.repeat(43) }).expect(401);
      const tokens = await signIn();
      await pool.query(`update refresh_tokens set expires_at = now() - interval '1 second'`);
      await http().post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
    });

    it('signs out one device', async () => {
      const tokens = await signIn();
      await http().post('/v1/auth/logout').send({ refreshToken: tokens.refreshToken }).expect(204);
      await http().post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
      // Signing out twice is fine.
      await http().post('/v1/auth/logout').send({ refreshToken: tokens.refreshToken }).expect(204);
    });
  });

  describe('catalog', () => {
    it('lists active services with their styles', async () => {
      const response = await http().get('/v1/services').expect(200);
      const slugs = response.body.map((item: { slug: string }) => item.slug);
      expect(slugs).toEqual(['yoga', 'strength', 'pilates', 'zumba']);
      const yoga = response.body[0];
      expect(yoga.formats.map((f: { slug: string }) => f.slug)).toEqual(['power-yoga', 'vinyasa-yoga', 'hatha-yoga']);
      expect(yoga.formats[0].description).toContain('flowing poses');
    });
  });

  describe('errors', () => {
    it('answers unknown routes in the same error shape', async () => {
      const response = await http().get('/v1/nothing-here').expect(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
