import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { APP_CONFIG, type Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { EmailProvider } from '../email/email.provider';
import { loginCodeEmail } from './email-otp.template';
import { TokenService, type IssuedTokens } from './token.service';

export type EmailAudience = 'trainer' | 'admin';

type ChallengeRow = { id: string; code_hash: string; attempts: number };
type VerifyOutcome =
  | { kind: 'ok'; tokens: IssuedTokens; isNewUser: boolean }
  | { kind: 'invalid' }
  | { kind: 'locked' }
  | { kind: 'blocked' };

export type EmailVerifyResult = IssuedTokens & { isNewUser: boolean };

// Sign in with a code sent by email. Same rules as the phone code: single use, expiry, wrong-guess lockout,
// per-address limits. Admin sign-in only ever sends a code to an address that already has the admin role.
@Injectable()
export class EmailOtpService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: Env,
    private readonly db: DatabaseService,
    private readonly email: EmailProvider,
    private readonly tokens: TokenService,
  ) {}

  async request(email: string, audience: EmailAudience): Promise<{ resendAfterSeconds: number }> {
    const resendAfterSeconds = this.config.OTP_RESEND_SECONDS;

    // For admins, an unknown address gets the same answer as a known one and no mail: nobody can probe who is an admin.
    if (audience === 'admin' && !(await this.isAdmin(email))) return { resendAfterSeconds };

    const code = this.config.DEV_FIXED_OTP ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
    const challengeId = uuidv7();
    await this.db.tx(async (client) => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`email:${email}`]);

      const last = await client.query<{ wait: number }>(
        `select greatest(0, ceil($2 - extract(epoch from (now() - created_at))))::int as wait
           from otp_challenges where email = $1 order by created_at desc limit 1`,
        [email, this.config.OTP_RESEND_SECONDS],
      );
      const wait = last.rows[0]?.wait ?? 0;
      if (wait > 0) throw new DomainError('OTP_RATE_LIMITED', 'Please wait before asking for another code.', { retryAfterSeconds: wait });

      const hourly = await client.query<{ count: string }>(
        `select count(*) from otp_challenges where email = $1 and created_at > now() - interval '1 hour'`,
        [email],
      );
      if (Number(hourly.rows[0]?.count ?? 0) >= this.config.OTP_HOURLY_LIMIT) {
        throw new DomainError('OTP_RATE_LIMITED', 'Too many codes requested. Please try again later.');
      }

      await client.query(
        `insert into otp_challenges (id, email, code_hash, expires_at) values ($1, $2, $3, now() + make_interval(secs => $4))`,
        [challengeId, email, this.hash(email, code), this.config.OTP_TTL_SECONDS],
      );
    });

    // Sent after the commit: a rolled-back request must never email anyone.
    try {
      await this.email.send(loginCodeEmail(email, code, Math.max(1, Math.round(this.config.OTP_TTL_SECONDS / 60)), audience));
    } catch (error) {
      await this.db.query('delete from otp_challenges where id = $1', [challengeId]);
      throw new DomainError('EMAIL_FAILED', 'We could not send the code. Please try again.', undefined, { cause: error });
    }
    return { resendAfterSeconds };
  }

  async verify(email: string, code: string, device: Record<string, unknown>, audience: EmailAudience): Promise<EmailVerifyResult> {
    const outcome = await this.db.tx<VerifyOutcome>(async (client) => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`email:${email}`]);

      const found = await client.query<ChallengeRow>(
        `select id, code_hash, attempts from otp_challenges
          where email = $1 and consumed_at is null and expires_at > now()
          order by created_at desc limit 1 for update`,
        [email],
      );
      const challenge = found.rows[0];
      if (!challenge) return { kind: 'invalid' };
      if (challenge.attempts >= this.config.OTP_MAX_ATTEMPTS) return { kind: 'locked' };

      if (!this.matches(challenge.code_hash, email, code)) {
        const attempts = challenge.attempts + 1;
        await client.query('update otp_challenges set attempts = $2 where id = $1', [challenge.id, attempts]);
        return { kind: attempts >= this.config.OTP_MAX_ATTEMPTS ? 'locked' : 'invalid' };
      }

      let userId: string;
      let status: string;
      let inserted = false;
      if (audience === 'admin') {
        // Only an existing admin account can sign in here. Never creates one.
        const admin = await client.query<{ id: string; status: string }>(
          `select u.id, u.status from users u join user_roles r on r.user_id = u.id and r.role = 'admin' where u.verified_email = $1`,
          [email],
        );
        const row = admin.rows[0];
        if (!row) return { kind: 'invalid' };
        userId = row.id;
        status = row.status;
        await client.query('update users set last_login_at = now() where id = $1', [userId]);
      } else {
        const user = await client.query<{ id: string; status: string; inserted: boolean }>(
          `insert into users (id, verified_email, last_login_at) values ($1, $2, now())
           on conflict (verified_email) where verified_email is not null do update set last_login_at = now()
           returning id, status, (xmax = 0) as inserted`,
          [uuidv7(), email],
        );
        const row = user.rows[0];
        if (!row) throw new Error('User upsert returned no row');
        userId = row.id;
        status = row.status;
        inserted = row.inserted;
      }

      // A code is used up only when it is accepted for a real sign-in.
      await client.query('update otp_challenges set consumed_at = now() where id = $1', [challenge.id]);
      if (status !== 'active') return { kind: 'blocked' };
      // Email sign-in never makes anyone a customer: the trainer role is granted only when an application is approved.
      return { kind: 'ok', tokens: await this.tokens.issue(client, userId, device), isNewUser: inserted };
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

  private async isAdmin(email: string): Promise<boolean> {
    const found = await this.db.query(
      `select 1 from users u join user_roles r on r.user_id = u.id and r.role = 'admin' where u.verified_email = $1 and u.status = 'active'`,
      [email],
    );
    return found.rows.length > 0;
  }

  private hash(email: string, code: string): string {
    return createHmac('sha256', this.config.OTP_SECRET).update(`email:${email}:${code}`).digest('hex');
  }

  private matches(storedHash: string, email: string, code: string): boolean {
    const expected = Buffer.from(storedHash, 'hex');
    const actual = Buffer.from(this.hash(email, code), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
