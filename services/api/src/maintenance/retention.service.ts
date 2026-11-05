import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../config/env';
import { DatabaseService } from '../database/database.service';

// How long short-lived personal records are kept. ASSUMPTIONS: change them here only (and in the Privacy Policy text).
export const RETENTION = {
  // A sign-in code is useless after minutes, but the row holds a phone number or email.
  otpChallengeDays: 1,
  // Expired sign-in sessions hold the device and nothing else of use.
  refreshTokenDaysAfterExpiry: 30,
  // Only used to rate-limit code guessing.
  discountAttemptDays: 90,
  // The consent itself is kept as proof; the network address recorded with it is dropped after this.
  consentIpDays: 365,
  // A phone that has not opened the app for this long probably no longer has it; its push token is dropped.
  staleDeviceDays: 180,
  // Who was offered a finished session is no longer needed.
  jobAlertDays: 30,
  // The text of a message already sent to a customer (email, push) is no longer needed once it has been delivered.
  sentMessageDays: 30,
} as const;

export type RetentionResult = { otpChallenges: number; refreshTokens: number; discountAttempts: number; consentIps: number; staleDevices: number; jobAlerts: number; sentMessages: number };

// Data minimisation: personal data we no longer need is deleted on a schedule instead of piling up.
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Retention');
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly db: DatabaseService, @Inject(APP_CONFIG) private readonly config: Env) {}

  onModuleInit(): void {
    if (this.config.NODE_ENV === 'test') return;
    const run = () => void this.runOnce().catch((error: unknown) => this.logger.warn(`Retention run failed: ${error instanceof Error ? error.message : String(error)}`));
    setTimeout(run, 60_000).unref();
    this.timer = setInterval(run, 6 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<RetentionResult> {
    const count = async (sql: string, params: unknown[] = []) => (await this.db.query(sql, params)).rowCount ?? 0;
    const result: RetentionResult = {
      otpChallenges: await count(`delete from otp_challenges where created_at < now() - ($1 || ' days')::interval`, [RETENTION.otpChallengeDays]),
      refreshTokens: await count(`delete from refresh_tokens where expires_at < now() - ($1 || ' days')::interval`, [RETENTION.refreshTokenDaysAfterExpiry]),
      discountAttempts: await count(`delete from discount_attempts where created_at < now() - ($1 || ' days')::interval`, [RETENTION.discountAttemptDays]),
      consentIps: await count(
        `update consents set ip = null where ip is not null
            and (recorded_at < now() - ($1 || ' days')::interval or user_id in (select id from users where status = 'deleted'))`,
        [RETENTION.consentIpDays],
      ),
      staleDevices: await count(`delete from notification_devices where last_seen_at < now() - ($1 || ' days')::interval`, [RETENTION.staleDeviceDays]),
      sentMessages: await count(`delete from outbox_events where event_type = 'customer.notify' and published_at < now() - ($1 || ' days')::interval`, [RETENTION.sentMessageDays]),
      jobAlerts: await count(
        `delete from job_alerts a using bookings b where b.id = a.booking_id and a.alerted_at < now() - ($1 || ' days')::interval and b.status not in ('matching', 'rematching')`,
        [RETENTION.jobAlertDays],
      ),
    };
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    if (total > 0) this.logger.log(`Removed or cleared ${total} old records: ${JSON.stringify(result)}`);
    return result;
  }
}
