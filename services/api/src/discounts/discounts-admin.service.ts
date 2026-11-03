import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { notifyCustomer } from '../customer/notify';
import { type AppliesTo, type DiscountKind, type DiscountReason, generateCode, normaliseCode } from './discounts.service';

export type NewDiscountCode = {
  code?: string | undefined;
  kind: DiscountKind;
  percentOff?: number | undefined;
  flatOffPaise?: number | undefined;
  maxDiscountPaise?: number | undefined;
  reason: DiscountReason;
  note?: string | undefined;
  customerEmail?: string | undefined;
  maxRedemptions: number;
  perUserLimit: number;
  minOrderPaise: number;
  appliesTo: AppliesTo;
  expiresAt?: string | undefined;
};

export type DiscountCodeView = {
  id: string;
  code: string;
  kind: DiscountKind;
  percentOff: number | null;
  flatOffPaise: number | null;
  maxDiscountPaise: number | null;
  reason: DiscountReason;
  note: string | null;
  customerEmail: string | null;
  maxRedemptions: number;
  perUserLimit: number;
  used: number;
  minOrderPaise: number;
  appliesTo: AppliesTo;
  expiresAt: string | null;
  status: 'active' | 'expired' | 'used_up' | 'disabled';
  createdBy: string | null;
  createdAt: string;
};

type ListRow = {
  id: string; code: string; kind: DiscountKind; percent_off: number | null; flat_off_paise: number | null; max_discount_paise: number | null;
  reason: DiscountReason; note: string | null; max_redemptions: number; per_user_limit: number; redemption_count: number; min_order_paise: number;
  applies_to: AppliesTo; expires_at: Date | null; disabled_at: Date | null; created_at: Date; customer_email: string | null; created_by_name: string | null;
};

const toView = (row: ListRow, now = Date.now()): DiscountCodeView => ({
  id: row.id,
  code: row.code,
  kind: row.kind,
  percentOff: row.percent_off,
  flatOffPaise: row.flat_off_paise,
  maxDiscountPaise: row.max_discount_paise,
  reason: row.reason,
  note: row.note,
  customerEmail: row.customer_email,
  maxRedemptions: row.max_redemptions,
  perUserLimit: row.per_user_limit,
  used: row.redemption_count,
  minOrderPaise: row.min_order_paise,
  appliesTo: row.applies_to,
  expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
  status: row.disabled_at ? 'disabled' : row.expires_at && row.expires_at.getTime() <= now ? 'expired' : row.redemption_count >= row.max_redemptions ? 'used_up' : 'active',
  createdBy: row.created_by_name,
  createdAt: row.created_at.toISOString(),
});

const LIST_SQL = `select d.*, coalesce(u.verified_email, u.email) as customer_email, a.display_name as created_by_name
                    from discount_codes d
                    left join users u on u.id = d.assigned_user_id
                    left join admin_profiles a on a.user_id = d.created_by`;

const isUnique = (error: unknown): boolean => typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

@Injectable()
export class DiscountsAdminService {
  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<DiscountCodeView[]> {
    const result = await this.db.query<ListRow>(`${LIST_SQL} order by d.created_at desc limit 500`);
    const now = Date.now();
    return result.rows.map((row) => toView(row, now));
  }

  async create(adminId: string, input: NewDiscountCode): Promise<DiscountCodeView> {
    const custom = input.code ? normaliseCode(input.code) : null;
    if (custom && !/^[A-Z0-9]{4,20}$/.test(custom)) throw new DomainError('INVALID_REQUEST', 'A code is 4 to 20 letters and numbers.');
    if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) throw new DomainError('INVALID_REQUEST', 'The expiry must be in the future.');

    const id = await this.db.tx(async (client) => {
      let assignedUserId: string | null = null;
      if (input.customerEmail) {
        const email = input.customerEmail.toLowerCase();
        const customer = await client.query<{ id: string }>(
          `select u.id from users u join user_roles r on r.user_id = u.id and r.role = 'customer'
            where u.status = 'active' and (u.verified_email = $1 or lower(u.email) = $1) limit 1`,
          [email],
        );
        if (!customer.rows[0]) throw new DomainError('NOT_FOUND', 'No customer with that email. They need to have signed in to the app once.');
        assignedUserId = customer.rows[0].id;
      }

      // A made-up code that is already taken asks for another one; a generated code just draws again.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const code = custom ?? generateCode();
        const newId = uuidv7();
        try {
          await client.query('savepoint try_code');
          await client.query(
            `insert into discount_codes (id, code, kind, percent_off, flat_off_paise, max_discount_paise, reason, note, assigned_user_id,
                                         max_redemptions, per_user_limit, min_order_paise, applies_to, expires_at, created_by)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [newId, code, input.kind, input.percentOff ?? null, input.flatOffPaise ?? null, input.maxDiscountPaise ?? null, input.reason, input.note ?? null,
             assignedUserId, input.maxRedemptions, input.perUserLimit, input.minOrderPaise, input.appliesTo, input.expiresAt ?? null, adminId],
          );
          await client.query('release savepoint try_code');
          await client.query(
            `insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'discount.created', 'discount_code', $2, $3)`,
            [adminId, newId, JSON.stringify({ code, kind: input.kind, percentOff: input.percentOff ?? null, flatOffPaise: input.flatOffPaise ?? null, reason: input.reason, customerEmail: input.customerEmail ?? null })],
          );
          if (assignedUserId) {
            const off = input.kind === 'percent' ? `${input.percentOff}% off` : `₹${((input.flatOffPaise ?? 0) / 100).toLocaleString('en-IN')} off`;
            await notifyCustomer(client, assignedUserId, 'A discount for you', `Use code ${code} for ${off} at checkout.`, null);
          }
          return newId;
        } catch (error) {
          await client.query('rollback to savepoint try_code');
          if (!isUnique(error)) throw error;
          if (custom) throw new DomainError('INVALID_REQUEST', 'That code already exists. Choose another.');
        }
      }
      throw new DomainError('INTERNAL', 'Could not make a code. Please try again.');
    });
    const created = await this.db.query<ListRow>(`${LIST_SQL} where d.id = $1`, [id]);
    const row = created.rows[0];
    if (!row) throw new DomainError('INTERNAL', 'Could not read the new code.');
    return toView(row);
  }

  async disable(adminId: string, id: string): Promise<DiscountCodeView> {
    await this.db.tx(async (client) => {
      const done = await client.query(`update discount_codes set disabled_at = coalesce(disabled_at, now()) where id = $1 returning id`, [id]);
      if (!done.rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that code.');
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id) values ($1, 'discount.disabled', 'discount_code', $2)`, [adminId, id]);
    });
    const result = await this.db.query<ListRow>(`${LIST_SQL} where d.id = $1`, [id]);
    return toView(result.rows[0] as ListRow);
  }
}
