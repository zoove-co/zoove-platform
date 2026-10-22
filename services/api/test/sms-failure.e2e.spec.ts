import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { SmsProvider } from '../src/identity/sms/sms.provider';
import { startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

class BrokenSms extends SmsProvider {
  send(): Promise<void> {
    return Promise.reject(new Error('vendor is down'));
  }
}

suite('when the SMS vendor is down', () => {
  let app: NestExpressApplication;
  let pool: Pool;

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) => builder.overrideProvider(SmsProvider).useClass(BrokenSms)));
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query('truncate table otp_challenges');
  });

  it('answers SMS_FAILED and lets the customer try again straight away', async () => {
    const http = () => request(app.getHttpServer());
    for (let i = 0; i < 7; i += 1) {
      const r = await http().post('/v1/auth/otp/request').send({ phone: '+919876543210' }).expect(502);
      expect(r.body.error.code).toBe('SMS_FAILED');
    }
    // Seven failures did not use up the hourly limit or start a resend wait.
    const rows = await pool.query('select count(*)::int as n from otp_challenges');
    expect(rows.rows[0].n).toBe(0);
  });
});
