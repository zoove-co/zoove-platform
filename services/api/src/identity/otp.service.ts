import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { APP_CONFIG, type Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { assertIndianMobile } from './phone';
import { SmsProvider } from './sms/sms.provider';
import { TokenService, type IssuedTokens } from './token.service';

type ChallengeRow = { id: string; code_hash: string; attempts: number };
type VerifyOutcome =
  | { kind: 'ok'; tokens: IssuedTokens; isNewUser: boolean }
  | { kind: 'invalid' }
  | { kind: 'locked' }
  | { kind: 'blocked' };

export type VerifyResult = IssuedTokens & { isNewUser: boolean };

@Injectable()
export class OtpService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: Env,
    private readonly db: DatabaseService,
    private readonly sms: SmsProvider,
    private readonly tokens: TokenService,
  ) {}

  async request(phone: string): Promise<{ resendAfterSeconds: number }> {
    assertIndianMobile(phone);
    const code = this.config.DEV_FIXED_OTP ?? String(randomInt(0, 1_000_000)).padStart(6, '0');

    const challengeId = uuidv7();
    await this.db.tx(async (client) => {
      // One request per phone at a time, so two taps cannot both pass the limits below.
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [phone]);

      const last = await client.query<{ wait: number }>(
        `select greatest(0, ceil($2 - extract(epoch from (now() - created_at))))::int as wait
           from otp_challenges where phone_e164 = $1 order by created_at desc limit 1`,
        [phone, this.config.OTP_RESEND_SECONDS],
      );
      const wait = last.rows[0]?.wait ?? 0;
      if (wait > 0) {
        throw new DomainError('OTP_RATE_LIMITED', 'Please wait before asking for another code.', { retryAfterSeconds: wait });
      }

      const hourly = await client.query<{ count: string }>(
        `select count(*) from otp_challenges where phone_e164 = $1 and created_at > now() - interval '1 hour'`,
        [phone],
      );
      if (Number(hourly.rows[0]?.count ?? 0) >= this.config.OTP_HOURLY_LIMIT) {
        throw new DomainError('OTP_RATE_LIMITED', 'Too many codes requested. Please try again later.');
      }

      await client.query(
        `insert into otp_challenges (id, phone_e164, code_hash, expires_at)
         values ($1, $2, $3, now() + make_interval(secs => $4))`,
        [challengeId, phone, this.hash(phone, code), this.config.OTP_TTL_SECONDS],
      );
    });

    // The SMS goes out after the commit: a rolled-back request must never text anyone.
    try {
      await this.sms.sendOtp(phone, code, Math.max(1, Math.round(this.config.OTP_TTL_SECONDS / 60)));
    } catch (error) {
      // The customer never got a code, so do not make them wait 30 seconds or spend one of their hourly codes.
      await this.db.query('delete from otp_challenges where id = $1', [challengeId]);
      throw new DomainError('SMS_FAILED', 'We could not send the code. Please try again.', undefined, { cause: error });
    }
    return { resendAfterSeconds: this.config.OTP_RESEND_SECONDS };
  }

  // audience 'trainer' is the trainer web page: the person signs in but is NOT made a customer.
  async verify(
    phone: string,
    code: string,
    device: Record<string, unknown> = {},
    audience: 'customer' | 'trainer' = 'customer',
  ): Promise<VerifyResult> {
    assertIndianMobile(phone);

    // Wrong guesses must be counted even though the request fails, so the transaction returns an
    // outcome and the error is thrown after the commit.
    const outcome = await this.db.tx<VerifyOutcome>(async (client) => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [phone]);

      const found = await client.query<ChallengeRow>(
        `select id, code_hash, attempts from otp_challenges
          where phone_e164 = $1 and consumed_at is null and expires_at > now()
          order by created_at desc limit 1 for update`,
        [phone],
      );
      const challenge = found.rows[0];
      if (!challenge) return { kind: 'invalid' };
      if (challenge.attempts >= this.config.OTP_MAX_ATTEMPTS) return { kind: 'locked' };

      if (!this.matches(challenge.code_hash, phone, code)) {
        const attempts = challenge.attempts + 1;
        await client.query('update otp_challenges set attempts = $2 where id = $1', [challenge.id, attempts]);
        return { kind: attempts >= this.config.OTP_MAX_ATTEMPTS ? 'locked' : 'invalid' };
      }

      await client.query('update otp_challenges set consumed_at = now() where id = $1', [challenge.id]);

      const user = await client.query<{ id: string; status: string; inserted: boolean }>(
        `insert into users (id, phone_e164, last_login_at) values ($1, $2, now())
         on conflict (phone_e164) do update set last_login_at = now()
         returning id, status, (xmax = 0) as inserted`,
        [uuidv7(), phone],
      );
      const row = user.rows[0];
      if (!row) throw new Error('User upsert returned no row');
      if (row.status !== 'active') return { kind: 'blocked' };

      if (audience === 'customer') {
        await client.query(`insert into user_roles (user_id, role) values ($1, 'customer') on conflict do nothing`, [row.id]);
      }
      const tokens = await this.tokens.issue(client, row.id, device);
      return { kind: 'ok', tokens, isNewUser: row.inserted };
    });

    switch (outcome.kind) {
      case 'ok':
        return { ...outcome.tokens, isNewUser: outcome.isNewUser };
      case 'locked':
        throw new DomainError('OTP_LOCKED', 'Too many wrong codes. Please ask for a new code.');
      case 'blocked':
        throw new DomainError('ACCOUNT_BLOCKED', 'This account cannot sign in. Please contact support.');
      default:
        throw new DomainError('OTP_INVALID', 'That code is not correct or has expired.');
    }
  }

  // HMAC with a server secret: a leaked table cannot be brute-forced offline without the secret.
  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.config.OTP_SECRET).update(`${phone}:${code}`).digest('hex');
  }

  private matches(storedHash: string, phone: string, code: string): boolean {
    const expected = Buffer.from(storedHash, 'hex');
    const actual = Buffer.from(this.hash(phone, code), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
