import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { APP_CONFIG, type Env } from '../config/env';
import { DatabaseService } from '../database/database.service';

export type IssuedTokens = { token: string; refreshToken: string; expiresInSeconds: number };
export type AccessClaims = { sub: string; roles: string[] };

type RotateOutcome = { kind: 'ok'; tokens: IssuedTokens } | { kind: 'rejected' } | { kind: 'blocked' };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class TokenService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: Env,
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  // Short-lived access token (JWT) plus a long-lived opaque refresh token. Only the hash of the
  // refresh token is stored, so a database leak cannot be used to sign in.
  async issue(client: PoolClient, userId: string, device: Record<string, unknown> = {}): Promise<IssuedTokens> {
    const roles = await client.query<{ role: string }>('select role from user_roles where user_id = $1', [userId]);
    const claims: AccessClaims = { sub: userId, roles: roles.rows.map((row) => row.role) };
    const token = await this.jwt.signAsync(claims);

    const refreshToken = randomBytes(32).toString('base64url');
    await client.query(
      `insert into refresh_tokens (id, user_id, token_hash, device, expires_at)
       values ($1, $2, $3, $4, now() + make_interval(days => $5))`,
      [uuidv7(), userId, sha256(refreshToken), JSON.stringify(device), this.config.REFRESH_TOKEN_TTL_DAYS],
    );
    return { token, refreshToken, expiresInSeconds: this.config.ACCESS_TOKEN_TTL_SECONDS };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      return await this.jwt.verifyAsync<AccessClaims>(token, { algorithms: ['HS256'] });
    } catch {
      throw new DomainError('UNAUTHORIZED', 'Please sign in again.');
    }
  }

  // Each refresh token works once. Using an already-used token means it may have been stolen, so every
  // session of that user is ended and the real owner signs in again.
  async rotate(refreshToken: string, device: Record<string, unknown> = {}): Promise<IssuedTokens> {
    const outcome = await this.db.tx<RotateOutcome>(async (client) => {
      const found = await client.query<{ id: string; user_id: string; revoked: boolean; expired: boolean; status: string }>(
        `select rt.id, rt.user_id, (rt.revoked_at is not null) as revoked, (rt.expires_at <= now()) as expired, u.status
           from refresh_tokens rt join users u on u.id = rt.user_id
          where rt.token_hash = $1 for update of rt`,
        [sha256(refreshToken)],
      );
      const row = found.rows[0];
      if (!row) return { kind: 'rejected' };

      if (row.revoked) {
        await client.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [row.user_id]);
        return { kind: 'rejected' };
      }
      if (row.expired) return { kind: 'rejected' };
      if (row.status !== 'active') return { kind: 'blocked' };

      await client.query('update refresh_tokens set revoked_at = now() where id = $1', [row.id]);
      return { kind: 'ok', tokens: await this.issue(client, row.user_id, device) };
    });

    if (outcome.kind === 'blocked') throw new DomainError('ACCOUNT_BLOCKED', 'This account cannot sign in. Please contact support.');
    if (outcome.kind === 'rejected') throw new DomainError('UNAUTHORIZED', 'Please sign in again.');
    return outcome.tokens;
  }

  // Sign out. Safe to call twice; an unknown token is ignored on purpose.
  async revoke(refreshToken: string): Promise<void> {
    await this.db.query('update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null', [sha256(refreshToken)]);
  }
}
