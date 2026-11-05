import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import { generateCode } from '../discounts/discounts.service';

export type RewardSide = 'referrer' | 'friend';
export type RewardRule = {
  side: RewardSide; enabled: boolean; kind: 'flat' | 'percent' | null; flatOffPaise: number | null; percentOff: number | null;
  maxDiscountPaise: number | null; validDays: number;
};
export type RewardRuleInput = Omit<RewardRule, 'side'>;
export type IssuedReward = { id: string; side: RewardSide; customer: string; code: string; state: 'unused' | 'used' | 'expired' | 'switched_off'; createdAt: string; expiresAt: string | null };

type RuleRow = { side: RewardSide; enabled: boolean; kind: 'flat' | 'percent' | null; flat_off_paise: number | null; percent_off: number | null; max_discount_paise: number | null; valid_days: number };
const toRule = (r: RuleRow): RewardRule => ({
  side: r.side, enabled: r.enabled, kind: r.kind, flatOffPaise: r.flat_off_paise, percentOff: r.percent_off, maxDiscountPaise: r.max_discount_paise, validDays: r.valid_days,
});

const TITLES: Record<RewardSide, string> = { referrer: 'You earned a referral reward', friend: 'A welcome reward from your friend\'s referral' };

// What a referral earns is set in the admin panel (Rewards). A reward is a single-use discount code made for one customer,
// so it uses the same checks as every other code. Both sides start switched off: nothing is decided yet (open question 10).
@Injectable()
export class RewardsService {
  constructor(private readonly db: DatabaseService) {}

  // Called inside the booking transaction when a referred customer makes their first booking. Runs at most once per
  // referral and side (unique key), and only for sides that are switched on and for customers who are still active.
  async grant(client: PoolClient, referralId: string, referrerId: string, friendId: string): Promise<void> {
    const rules = (await client.query<RuleRow>(`select side, enabled, kind, flat_off_paise, percent_off, max_discount_paise, valid_days from reward_rules where enabled`)).rows;
    for (const rule of rules) {
      const userId = rule.side === 'referrer' ? referrerId : friendId;
      if (!(await client.query(`select 1 from users where id = $1 and status = 'active'`, [userId])).rows[0]) continue;
      const existing = await client.query(`select 1 from referral_rewards where referral_id = $1 and side = $2`, [referralId, rule.side]);
      if (existing.rows[0]) continue;
      const codeId = uuidv7();
      let code = '';
      for (let attempt = 0; attempt < 8 && !code; attempt += 1) {
        const made = generateCode(8);
        const ins = await client.query(
          `insert into discount_codes (id, code, kind, percent_off, flat_off_paise, max_discount_paise, reason, note, assigned_user_id,
                                       max_redemptions, per_user_limit, applies_to, expires_at)
           values ($1, $2, $3, $4, $5, $6, 'referral', $7, $8, 1, 1, 'session', now() + ($9 || ' days')::interval)
           on conflict (code) do nothing returning id`,
          [codeId, made, rule.kind, rule.percent_off, rule.flat_off_paise, rule.max_discount_paise, `Referral reward (${rule.side})`, userId, String(rule.valid_days)],
        );
        if (ins.rows[0]) code = made;
      }
      if (!code) throw new DomainError('INTERNAL', 'Could not make a reward code.');
      await client.query(`insert into referral_rewards (id, referral_id, side, user_id, discount_code_id) values ($1, $2, $3, $4, $5)`, [uuidv7(), referralId, rule.side, userId, codeId]);
      const worth = rule.kind === 'percent' ? `${rule.percent_off}% off` : `₹${((rule.flat_off_paise ?? 0) / 100).toLocaleString('en-IN')} off`;
      await notifyCustomer(client, userId, TITLES[rule.side], `Use code ${code} for ${worth} on a session. It works once and expires in ${rule.valid_days} days.`, null);
    }
  }

  async rules(): Promise<RewardRule[]> {
    const r = await this.db.query<RuleRow>(`select side, enabled, kind, flat_off_paise, percent_off, max_discount_paise, valid_days from reward_rules order by side desc`);
    return r.rows.map(toRule);
  }

  async saveRule(adminId: string, side: RewardSide, input: RewardRuleInput): Promise<RewardRule[]> {
    if (input.enabled) {
      if (input.kind === 'flat' && !input.flatOffPaise) throw new DomainError('INVALID_REQUEST', 'Enter how many rupees come off.');
      if (input.kind === 'percent' && !input.percentOff) throw new DomainError('INVALID_REQUEST', 'Enter the percent that comes off.');
      if (!input.kind) throw new DomainError('INVALID_REQUEST', 'Choose a flat amount or a percent.');
    }
    // A switched-off reward may be half filled in; store only a complete choice so the table checks always hold.
    const complete = (input.kind === 'flat' && input.flatOffPaise) || (input.kind === 'percent' && input.percentOff);
    const kind = complete ? input.kind : null;
    const flat = kind === 'flat' ? input.flatOffPaise : null;
    const percent = kind === 'percent' ? input.percentOff : null;
    const cap = kind === 'percent' ? input.maxDiscountPaise : null;
    await this.db.tx(async (client) => {
      await client.query(`insert into reward_rules (side) values ($1) on conflict do nothing`, [side]);
      const before = (await client.query(`select enabled, kind, flat_off_paise, percent_off, max_discount_paise, valid_days from reward_rules where side = $1 for update`, [side])).rows[0];
      await client.query(
        `update reward_rules set enabled = $2, kind = $3, flat_off_paise = $4, percent_off = $5, max_discount_paise = $6, valid_days = $7, updated_by = $8, updated_at = now() where side = $1`,
        [side, input.enabled, kind, flat, percent, cap, input.validDays, adminId],
      );
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, before, after) values ($1, 'rewards.rule_saved', 'reward_rule', $2, $3)`, [adminId, JSON.stringify({ side, ...before }), JSON.stringify({ side, ...input })]);
    });
    return this.rules();
  }

  async issued(): Promise<IssuedReward[]> {
    const r = await this.db.query<{ id: string; side: RewardSide; email: string | null; phone_e164: string | null; code: string; created_at: Date; expires_at: Date | null; disabled_at: Date | null; redemption_count: number }>(
      `select rr.id, rr.side, u.email, u.phone_e164, c.code, rr.created_at, c.expires_at, c.disabled_at, c.redemption_count
         from referral_rewards rr join discount_codes c on c.id = rr.discount_code_id join users u on u.id = rr.user_id
        order by rr.created_at desc limit 200`,
    );
    const now = Date.now();
    return r.rows.map((row) => ({
      id: row.id, side: row.side, customer: row.email ?? row.phone_e164 ?? 'Customer', code: row.code, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
      state: row.redemption_count > 0 ? 'used' : row.disabled_at ? 'switched_off' : row.expires_at && row.expires_at.getTime() <= now ? 'expired' : 'unused',
    }));
  }

  async stats(): Promise<{ signedUp: number; booked: number; rewardsGiven: number }> {
    const r = (await this.db.query<{ signed_up: string; booked: string; rewards: string }>(
      `select (select count(*) from referrals) as signed_up, (select count(*) from referrals where status = 'booked') as booked, (select count(*) from referral_rewards) as rewards`)).rows[0]!;
    return { signedUp: Number(r.signed_up), booked: Number(r.booked), rewardsGiven: Number(r.rewards) };
  }

  async switchOff(adminId: string, rewardId: string): Promise<void> {
    await this.db.tx(async (client) => {
      const row = (await client.query<{ discount_code_id: string }>(`select discount_code_id from referral_rewards where id = $1`, [rewardId])).rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 'We could not find that reward.');
      await client.query(`update discount_codes set disabled_at = coalesce(disabled_at, now()) where id = $1`, [row.discount_code_id]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id) values ($1, 'rewards.reward_switched_off', 'referral_reward', $2)`, [adminId, rewardId]);
    });
  }
}
