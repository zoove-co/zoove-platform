import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import { RewardsService } from './rewards.service';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join('');

export type ReferralSummary = { code: string; signedUp: number; booked: number; referredBy: boolean };

// The link between two customers is tracked here. What a referral earns is set in the admin Rewards tab
// (switched off until the business decides, open question 10); RewardsService gives it out on the first booking.
@Injectable()
export class ReferralService {
  private readonly logger = new Logger('Referral');
  constructor(private readonly db: DatabaseService, private readonly rewards: RewardsService) {}

  async summary(userId: string): Promise<ReferralSummary> {
    return this.db.tx(async (client) => {
      let code = (await client.query<{ code: string }>(`select code from referral_codes where user_id = $1`, [userId])).rows[0]?.code;
      for (let attempt = 0; !code && attempt < 5; attempt += 1) {
        const made = makeCode();
        const ins = await client.query<{ code: string }>(`insert into referral_codes (user_id, code) values ($1, $2) on conflict do nothing returning code`, [userId, made]);
        code = ins.rows[0]?.code ?? (await client.query<{ code: string }>(`select code from referral_codes where user_id = $1`, [userId])).rows[0]?.code;
      }
      if (!code) throw new DomainError('INTERNAL', 'Could not make a referral code.');
      const counts = (await client.query<{ signed_up: string; booked: string }>(
        `select count(*) as signed_up, count(*) filter (where status = 'booked') as booked from referrals where referrer_id = $1`, [userId])).rows[0]!;
      const by = (await client.query(`select 1 from referrals where referred_id = $1`, [userId])).rows[0];
      return { code, signedUp: Number(counts.signed_up), booked: Number(counts.booked), referredBy: Boolean(by) };
    });
  }

  // A new customer types a friend's code. Allowed once, and only before their first booking.
  async apply(userId: string, rawCode: string): Promise<{ ok: true }> {
    const code = rawCode.trim().toUpperCase().replace(/[\s-]/g, '');
    await this.db.tx(async (client) => {
      const owner = (await client.query<{ user_id: string }>(`select r.user_id from referral_codes r join users u on u.id = r.user_id and u.status = 'active' where r.code = $1`, [code])).rows[0];
      if (!owner) throw new DomainError('NOT_FOUND', 'That referral code is not valid.');
      if (owner.user_id === userId) throw new DomainError('INVALID_REQUEST', 'You cannot use your own referral code.');
      if ((await client.query(`select 1 from referrals where referred_id = $1`, [userId])).rows[0]) throw new DomainError('INVALID_STATE', 'You have already used a referral code.');
      if ((await client.query(`select 1 from bookings where user_id = $1 and status <> 'cancelled' limit 1`, [userId])).rows[0]) {
        throw new DomainError('INVALID_STATE', 'Referral codes work for new customers, before their first booking.');
      }
      await client.query(`insert into referrals (id, referrer_id, referred_id, code) values ($1, $2, $3, $4)`, [uuidv7(), owner.user_id, userId, code]);
      await notifyCustomer(client, owner.user_id, 'A friend joined with your code', 'Someone just signed up with your referral code. We will tell you when they book.', null);
    });
    return { ok: true };
  }

  // Called from the booking transaction: the referred customer's first booking marks the referral as booked.
  async markBooked(client: PoolClient, userId: string): Promise<void> {
    const done = await client.query<{ id: string; referrer_id: string }>(
      `update referrals set status = 'booked', booked_at = now() where referred_id = $1 and status = 'signed_up' returning id, referrer_id`, [userId]);
    // Rewards switched on in the admin panel are given once, at this moment. Switched off by default.
    // A reward problem must never stop the customer's booking: it runs in a savepoint and is only logged if it fails.
    if (done.rows[0]) {
      await client.query('savepoint reward_grant');
      try {
        await this.rewards.grant(client, done.rows[0].id, done.rows[0].referrer_id, userId);
        await client.query('release savepoint reward_grant');
      } catch (error) {
        await client.query('rollback to savepoint reward_grant');
        this.logger.error(`Reward for referral ${done.rows[0].id} could not be given: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
