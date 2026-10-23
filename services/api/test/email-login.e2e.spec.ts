import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { EmailProvider, type EmailMessage } from '../src/email/email.provider';
import { StorageService } from '../src/storage/storage.service';
import { CODE, startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

class MemoryEmail extends EmailProvider {
  sent: EmailMessage[] = [];
  fail = false;
  send(message: EmailMessage): Promise<void> {
    if (this.fail) return Promise.reject(new Error('mail vendor down'));
    this.sent.push(message);
    return Promise.resolve();
  }
}

class NoStorage extends StorageService {
  put(): Promise<void> {
    return Promise.resolve();
  }
  signedGetUrl(key: string): Promise<string> {
    return Promise.resolve(`https://files.test/${key}`);
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

suite('email sign-in (trainer page and admin panel)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const mail = new MemoryEmail();
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  // Pretend the previous code was asked a while ago so the resend wait never blocks a test.
  const age = (email: string) => pool.query(`update otp_challenges set created_at = created_at - interval '2 minutes' where email = $1`, [email.toLowerCase()]);

  async function login(email: string, audience: 'trainer' | 'admin' = 'trainer') {
    await age(email);
    await http().post('/v1/auth/email-otp/request').send({ email, audience }).expect(200);
    return http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience });
  }

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) => builder.overrideProvider(EmailProvider).useValue(mail).overrideProvider(StorageService).useValue(new NoStorage())));
    await pool.query('truncate table trainer_application_events, trainer_documents, trainers, trainer_applications, outbox_events, audit_log restart identity cascade');
    await pool.query(`delete from otp_challenges where email is not null`);
    await pool.query(`delete from admin_profiles`);
    await pool.query(`delete from user_roles where user_id in (select id from users where verified_email is not null)`);
    await pool.query(`delete from users where verified_email is not null or email in ('victim@example.com')`);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('emails a 6-digit code and signs a trainer in without making them a customer', async () => {
    await http().post('/v1/auth/email-otp/request').send({ email: 'Asha@Example.com' }).expect(200);
    const message = mail.sent.find((m) => m.to === 'asha@example.com');
    expect(message?.subject).toBe(`${CODE} is your Zoove code`);
    expect(message?.text).toContain(CODE);

    const verified = await http().post('/v1/auth/email-otp/verify').send({ email: 'asha@example.com', code: CODE }).expect(200);
    expect(verified.body).toMatchObject({ isNewUser: true });
    expect(verified.body.token).toEqual(expect.any(String));
    expect(verified.body.refreshToken).toEqual(expect.any(String));

    const user = await pool.query(`select id, phone_e164, email, verified_email from users where verified_email = 'asha@example.com'`);
    expect(user.rows).toHaveLength(1);
    expect(user.rows[0]).toMatchObject({ phone_e164: null, email: null });
    const roles = await pool.query(`select role from user_roles where user_id = $1`, [user.rows[0].id]);
    expect(roles.rows).toEqual([]);
  });

  it('the same address in another case is the same account, and the refresh token works', async () => {
    const first = await login('asha@example.com');
    const second = await login('ASHA@example.com');
    expect(second.body.isNewUser).toBe(false);
    const users = await pool.query(`select id from users where verified_email = 'asha@example.com'`);
    expect(users.rows).toHaveLength(1);
    expect(first.status).toBe(200);
    await http().post('/v1/auth/refresh').send({ refreshToken: second.body.refreshToken }).expect(200);
  });

  it('rejects a wrong code, then locks after too many wrong guesses', async () => {
    await age('wrong@example.com');
    await http().post('/v1/auth/email-otp/request').send({ email: 'wrong@example.com' }).expect(200);
    for (let i = 0; i < 4; i += 1) {
      const r = await http().post('/v1/auth/email-otp/verify').send({ email: 'wrong@example.com', code: '000000' }).expect(400);
      expect(r.body.error.code).toBe('OTP_INVALID');
    }
    const locked = await http().post('/v1/auth/email-otp/verify').send({ email: 'wrong@example.com', code: '000000' }).expect(429);
    expect(locked.body.error.code).toBe('OTP_LOCKED');
    // Even the right code no longer works on a locked challenge.
    await http().post('/v1/auth/email-otp/verify').send({ email: 'wrong@example.com', code: CODE }).expect(429);
  });

  it('a code works only once', async () => {
    await login('once@example.com').then((r) => expect(r.status).toBe(200));
    const again = await http().post('/v1/auth/email-otp/verify').send({ email: 'once@example.com', code: CODE }).expect(400);
    expect(again.body.error.code).toBe('OTP_INVALID');
  });

  it('makes a trainer wait before asking again', async () => {
    await http().post('/v1/auth/email-otp/request').send({ email: 'fast@example.com' }).expect(200);
    const second = await http().post('/v1/auth/email-otp/request').send({ email: 'fast@example.com' }).expect(429);
    expect(second.body.error.code).toBe('OTP_RATE_LIMITED');
    expect(second.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('refuses a malformed address', async () => {
    await http().post('/v1/auth/email-otp/request').send({ email: 'not-an-email' }).expect(400);
    await http().post('/v1/auth/email-otp/verify').send({ email: 'a@b.co', code: '12' }).expect(400);
  });

  it('a failed email send gives a clear error and does not use up the trainer\'s wait', async () => {
    mail.fail = true;
    const failed = await http().post('/v1/auth/email-otp/request').send({ email: 'down@example.com' }).expect(502);
    expect(failed.body.error.code).toBe('EMAIL_FAILED');
    mail.fail = false;
    await http().post('/v1/auth/email-otp/request').send({ email: 'down@example.com' }).expect(200);
  });

  it('a customer cannot take over a trainer login by typing that address into their profile', async () => {
    // The customer's profile email is not proven, so it must not be what the email sign-in finds.
    const customer = await pool.query(`insert into users (id, phone_e164, email) values (gen_random_uuid(), '+919855550001', 'victim@example.com') returning id`);
    const verified = await login('victim@example.com');
    expect(verified.status).toBe(200);
    const owner = await pool.query(`select id from users where verified_email = 'victim@example.com'`);
    expect(owner.rows[0].id).not.toBe(customer.rows[0].id);
    await pool.query(`delete from users where id = $1`, [customer.rows[0].id]);
  });

  it('prefills the application with the verified email and asks for a phone number', async () => {
    const t = (await login('applicant@example.com')).body.token as string;
    const view = await http().get('/v1/trainer-application').set(as(t)).expect(200);
    // Nothing is saved yet, but the form already starts with the email they signed in with.
    expect(view.body.form.email).toBe('applicant@example.com');
    expect(view.body.missing).toContain('phone');
    await http().put('/v1/trainer-application').set(as(t)).send({ firstName: 'Ravi' }).expect(200);
    const saved = await http().get('/v1/trainer-application').set(as(t)).expect(200);
    expect(saved.body.form.email).toBe('applicant@example.com');
    expect(saved.body.form.phone).toBeNull();

    await http().put('/v1/trainer-application').set(as(t)).send({ phone: '12345' }).expect(400);
    const ok = await http().put('/v1/trainer-application').set(as(t)).send({ phone: '+919812300000' }).expect(200);
    expect(ok.body.form.phone).toBe('+919812300000');
    expect(ok.body.missing).not.toContain('phone');
    expect(ok.body.missing).not.toContain('email');
  });

  describe('admin', () => {
    it('sends no code and signs nobody in unless the address belongs to an admin', async () => {
      const before = mail.sent.length;
      await http().post('/v1/auth/email-otp/request').send({ email: 'stranger@example.com', audience: 'admin' }).expect(200);
      expect(mail.sent.length).toBe(before);
      await http().post('/v1/auth/email-otp/verify').send({ email: 'stranger@example.com', code: CODE, audience: 'admin' }).expect(400);
      const users = await pool.query(`select 1 from users where verified_email = 'stranger@example.com'`);
      expect(users.rows).toEqual([]);
    });

    it('an admin signs in with an emailed code and can open the trainer review list; a trainer cannot', async () => {
      const admin = await pool.query(`insert into users (id, verified_email) values (gen_random_uuid(), 'boss@zoove.co') returning id`);
      await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [admin.rows[0].id]);

      const before = mail.sent.length;
      const r = await login('boss@zoove.co', 'admin');
      expect(r.status).toBe(200);
      expect(mail.sent.length).toBe(before + 1);
      const token = r.body.token as string;
      // An admin role with no team profile gets nothing (fail closed) until an owner adds them to the team.
      await http().get('/v1/admin/trainer-applications?status=pending').set(as(token)).expect(403);
      await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner) values ($1, 'Boss', 'Owner', true)`, [admin.rows[0].id]);
      const list = await http().get('/v1/admin/trainer-applications?status=pending').set(as(token)).expect(200);
      expect(list.body).toHaveProperty('items');

      const trainerToken = (await login('asha@example.com')).body.token as string;
      await http().get('/v1/admin/trainer-applications').set(as(trainerToken)).expect(403);
    });

    it('a blocked admin gets no code and cannot sign in', async () => {
      await pool.query(`update users set status = 'blocked' where verified_email = 'boss@zoove.co'`);
      await age('boss@zoove.co');
      const before = mail.sent.length;
      await http().post('/v1/auth/email-otp/request').send({ email: 'boss@zoove.co', audience: 'admin' }).expect(200);
      expect(mail.sent.length).toBe(before);
      await http().post('/v1/auth/email-otp/verify').send({ email: 'boss@zoove.co', code: CODE, audience: 'admin' }).expect(400);
    });
  });
});
