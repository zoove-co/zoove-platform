import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';

import { RetentionService } from '../src/maintenance/retention.service';
import { startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('data retention', () => {
  let app: NestExpressApplication;
  let pool: Pool;

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string));
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('deletes old sign-in codes and keeps recent ones', async () => {
    await pool.query(`delete from otp_challenges where email like 'ret-%'`);
    await pool.query(
      `insert into otp_challenges (email, code_hash, expires_at, created_at) values
        ('ret-old@zoove.test', 'h', now() - interval '3 days', now() - interval '3 days'),
        ('ret-new@zoove.test', 'h', now() + interval '5 minutes', now())`,
    );
    const result = await app.get(RetentionService).runOnce();
    expect(result.otpChallenges).toBeGreaterThanOrEqual(1);
    const left = await pool.query(`select email from otp_challenges where email like 'ret-%' order by email`);
    expect(left.rows.map((r: { email: string }) => r.email)).toEqual(['ret-new@zoove.test']);
    await pool.query(`delete from otp_challenges where email like 'ret-%'`);
  });
});
