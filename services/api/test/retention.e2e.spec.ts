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

  it('drops push tokens of phones not seen for half a year, and keeps active ones', async () => {
    const user = (await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [`ret-dev-${Date.now()}@zoove.test`])).rows[0]!.id;
    await pool.query(
      `insert into notification_devices (id, user_id, token, platform, last_seen_at) values
        (gen_random_uuid(), $1, $2, 'android', now() - interval '200 days'),
        (gen_random_uuid(), $1, $3, 'ios', now())`,
      [user, `ExponentPushToken[old-${Date.now()}]`, `ExponentPushToken[new-${Date.now()}]`],
    );
    const result = await app.get(RetentionService).runOnce();
    expect(result.staleDevices).toBeGreaterThanOrEqual(1);
    expect((await pool.query(`select platform from notification_devices where user_id = $1`, [user])).rows.map((r: { platform: string }) => r.platform)).toEqual(['ios']);
  });

  it('removes the text of messages already sent, and keeps unsent ones', async () => {
    const user = (await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [`ret-msg-${Date.now()}@zoove.test`])).rows[0]!.id;
    await pool.query(
      `insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload, created_at, published_at) values
        (gen_random_uuid(), 'user', $1, 'customer.notify', '{"title":"old"}', now() - interval '40 days', now() - interval '40 days'),
        (gen_random_uuid(), 'user', $1, 'customer.notify', '{"title":"waiting"}', now() - interval '40 days', null),
        (gen_random_uuid(), 'booking', $1, 'booking.created', '{}', now() - interval '40 days', now() - interval '40 days')`,
      [user],
    );
    await app.get(RetentionService).runOnce();
    const left = await pool.query(`select event_type, payload->>'title' as title from outbox_events where aggregate_id = $1 order by event_type, title`, [user]);
    expect(left.rows).toEqual([{ event_type: 'booking.created', title: null }, { event_type: 'customer.notify', title: 'waiting' }]); // analytics history is kept
  });
});
