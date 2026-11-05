import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import { DiscountsService, normaliseCode } from '../discounts/discounts.service';

export type PackageView = {
  id: string; name: string; sessionsCount: number; pricePaise: number; originalPricePaise: number | null; validityDays: number | null; badge: string | null;
};
export type PurchaseStatus = 'awaiting_payment' | 'paid' | 'cancelled';
export type PurchaseView = {
  id: string; name: string; sessionsCount: number; listPricePaise: number; discountPaise: number; discountCode: string | null; totalPaise: number;
  status: PurchaseStatus; creditsLeft: number; creditsTotal: number; expiresAt: string | null; paidAt: string | null; createdAt: string;
  // Past its end date. creditsLeft is 0 then, because those sessions can no longer be booked; creditsUnused is what was left over.
  expired: boolean; creditsUnused: number;
};
export type PackageException = { id: string; action: string; reason: string; extraSessions: number; extendDays: number; expiresAt: string | null; by: string; at: string };
export type CreditSummary = { creditsLeft: number; nextExpiry: string | null };

type PackageRow = { id: string; name: string; sessions_count: number; price_paise: number; original_price_paise: number | null; validity_days: number | null; badge: string | null };
type PurchaseRow = {
  id: string; name: string; sessions_count: number; list_price_paise: number; discount_paise: number; discount_code: string | null; total_paise: number; status: PurchaseStatus;
  credits_total: number; credits_used: number; expires_at: Date | null; paid_at: Date | null; created_at: Date; user_id: string; payment_method: string | null; payment_reference: string | null;
  email?: string | null; phone_e164?: string | null;
};

const toPackage = (r: PackageRow): PackageView => ({
  id: r.id, name: r.name, sessionsCount: r.sessions_count, pricePaise: r.price_paise,
  originalPricePaise: r.original_price_paise, validityDays: r.validity_days, badge: r.badge,
});
export const toPurchase = (r: PurchaseRow, now = new Date()): PurchaseView => {
  const unused = r.status === 'paid' ? r.credits_total - r.credits_used : 0;
  const expired = r.status === 'paid' && r.expires_at !== null && r.expires_at.getTime() <= now.getTime();
  return {
    id: r.id, name: r.name, sessionsCount: r.sessions_count, listPricePaise: r.list_price_paise, discountPaise: r.discount_paise, discountCode: r.discount_code,
    totalPaise: r.total_paise, status: r.status, creditsTotal: r.credits_total, creditsLeft: expired ? 0 : unused, creditsUnused: unused, expired,
    expiresAt: r.expires_at?.toISOString() ?? null, paidAt: r.paid_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(),
  };
};
export const formatDay = (d: Date): string => d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const COLS = `id, user_id, name, sessions_count, list_price_paise, discount_paise, discount_code, total_paise, status, credits_total, credits_used, expires_at, paid_at, created_at, payment_method, payment_reference`;

// Packages are bought "awaiting payment" and ops mark them paid in the admin panel. A payment provider (Razorpay) later
// replaces the manual step by calling markPaid itself; nothing else changes.
@Injectable()
export class PackagesService {
  constructor(private readonly db: DatabaseService, private readonly discounts: DiscountsService) {}

  async list(): Promise<PackageView[]> {
    const r = await this.db.query<PackageRow>(
      `select id, name, sessions_count, price_paise, original_price_paise, validity_days, badge from packages where is_active order by sort_order, sessions_count`,
    );
    return r.rows.map(toPackage);
  }

  async mine(userId: string): Promise<{ purchases: PurchaseView[]; credits: CreditSummary }> {
    const r = await this.db.query<PurchaseRow>(`select ${COLS} from package_purchases where user_id = $1 order by created_at desc limit 50`, [userId]);
    const purchases = r.rows.map((row) => toPurchase(row));
    return { purchases, credits: await this.credits(this.db, userId) };
  }

  async credits(db: { query: DatabaseService['query'] }, userId: string): Promise<CreditSummary> {
    const r = await db.query<{ left: string | null; next: Date | null }>(
      `select sum(credits_total - credits_used) as left, min(expires_at) as next from package_purchases
        where user_id = $1 and status = 'paid' and credits_used < credits_total and (expires_at is null or expires_at > now())`,
      [userId],
    );
    return { creditsLeft: Number(r.rows[0]?.left ?? 0), nextExpiry: r.rows[0]?.next?.toISOString() ?? null };
  }

  async buy(userId: string, input: { packageId: string; idempotencyKey: string; discountCode?: string | undefined }): Promise<PurchaseView> {
    const fingerprint = createHash('sha256').update(JSON.stringify([input.packageId, input.discountCode ? normaliseCode(input.discountCode) : null])).digest('hex');
    const row = await this.db.tx(async (client) => {
      const prior = await client.query<PurchaseRow & { request_fingerprint: string }>(`select ${COLS}, request_fingerprint from package_purchases where user_id = $1 and idempotency_key = $2`, [userId, input.idempotencyKey]);
      if (prior.rows[0]) {
        if (prior.rows[0].request_fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This request key was already used for a different purchase.');
        return prior.rows[0];
      }
      const pkg = (await client.query<PackageRow>(`select id, name, sessions_count, price_paise, original_price_paise, validity_days, badge from packages where id = $1 and is_active`, [input.packageId])).rows[0];
      if (!pkg) throw new DomainError('NOT_FOUND', 'That package is not available.');
      const id = uuidv7();
      const discount = input.discountCode ? await this.discounts.quote(client, userId, input.discountCode, pkg.price_paise, 'package', true) : null;
      const total = discount ? discount.totalPaise : pkg.price_paise;
      const created = await client.query<PurchaseRow>(
        `insert into package_purchases (id, user_id, package_id, name, sessions_count, list_price_paise, discount_code, discount_paise, total_paise, validity_days, credits_total, idempotency_key, request_fingerprint)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$5,$11,$12) returning ${COLS}`,
        [id, userId, pkg.id, pkg.name, pkg.sessions_count, pkg.price_paise, discount?.code ?? null, discount?.discountPaise ?? 0, total, pkg.validity_days, input.idempotencyKey, fingerprint],
      );
      if (discount) await this.discounts.redeem(client, userId, discount, null, id);
      await notifyCustomer(client, userId, 'Package ordered', `Your ${pkg.name} package is waiting for payment. Our team will confirm it once payment is received.`, null);
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'package_purchase', $2, 'package.ordered', $3)`, [uuidv7(), id, JSON.stringify({ totalPaise: total })]);
      return created.rows[0]!;
    });
    return toPurchase(row);
  }

  // Customer can drop an unpaid order.
  async cancelMine(userId: string, id: string): Promise<PurchaseView> {
    const row = await this.db.tx(async (client) => {
      const cur = (await client.query<PurchaseRow>(`select ${COLS} from package_purchases where id = $1 and user_id = $2 for update`, [id, userId])).rows[0];
      if (!cur) throw new DomainError('NOT_FOUND', 'We could not find that order.');
      if (cur.status === 'paid') throw new DomainError('CHANGE_WINDOW_CLOSED', 'A paid package cannot be cancelled here. Please contact support.');
      if (cur.status === 'cancelled') return cur;
      const upd = await client.query<PurchaseRow>(`update package_purchases set status = 'cancelled' where id = $1 returning ${COLS}`, [id]);
      await this.discounts.releaseForPurchase(client, id);
      return upd.rows[0]!;
    });
    return toPurchase(row);
  }

  // ---- ops (admin) ----
  async adminList(status?: PurchaseStatus): Promise<(PurchaseView & { customer: string; paymentMethod: string | null; paymentReference: string | null })[]> {
    const r = await this.db.query<PurchaseRow>(
      `select p.id, p.user_id, p.name, p.sessions_count, p.list_price_paise, p.discount_paise, p.discount_code, p.total_paise, p.status, p.credits_total, p.credits_used, p.expires_at, p.paid_at, p.created_at,
              p.payment_method, p.payment_reference, u.email, u.phone_e164
         from package_purchases p join users u on u.id = p.user_id
        where ($1::text is null or p.status = $1) order by (p.status = 'awaiting_payment') desc, p.created_at desc limit 200`,
      [status ?? null],
    );
    return r.rows.map((row) => ({ ...toPurchase(row), customer: row.email ?? row.phone_e164 ?? 'Customer', paymentMethod: row.payment_method, paymentReference: row.payment_reference }));
  }

  async markPaid(adminId: string, id: string, input: { method: string; reference: string }): Promise<PurchaseView> {
    const row = await this.db.tx(async (client) => {
      const cur = (await client.query<PurchaseRow>(`select ${COLS} from package_purchases where id = $1 for update`, [id])).rows[0];
      if (!cur) throw new DomainError('NOT_FOUND', 'Order not found.');
      if (cur.status === 'paid') return cur; // marking twice changes nothing
      if (cur.status === 'cancelled') throw new DomainError('INVALID_REQUEST', 'This order was cancelled.');
      const upd = await client.query<PurchaseRow>(
        `update package_purchases set status = 'paid', paid_at = now(), marked_paid_by = $2, payment_method = $3, payment_reference = $4,
                expires_at = case when validity_days is null then null else now() + (validity_days || ' days')::interval end
          where id = $1 returning ${COLS}`,
        [id, adminId, input.method, input.reference],
      );
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'package.marked_paid', 'package_purchase', $2, $3)`, [adminId, id, JSON.stringify(input)]);
      // Revenue event for analytics and marketing tools (no personal details in the payload).
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'package_purchase', $2, 'package.marked_paid', $3)`, [uuidv7(), id, JSON.stringify({ totalPaise: cur.total_paise })]);
      await notifyCustomer(client, cur.user_id, 'Package ready', `Payment received. You now have ${cur.credits_total} session credits from your ${cur.name} package.`, null);
      return upd.rows[0]!;
    });
    return toPurchase(row);
  }

  async adminCancel(adminId: string, id: string): Promise<PurchaseView> {
    const row = await this.db.tx(async (client) => {
      const cur = (await client.query<PurchaseRow>(`select ${COLS} from package_purchases where id = $1 for update`, [id])).rows[0];
      if (!cur) throw new DomainError('NOT_FOUND', 'Order not found.');
      if (cur.status === 'paid') throw new DomainError('INVALID_REQUEST', 'A paid order cannot be cancelled here.');
      if (cur.status === 'cancelled') return cur;
      const upd = await client.query<PurchaseRow>(`update package_purchases set status = 'cancelled' where id = $1 returning ${COLS}`, [id]);
      await this.discounts.releaseForPurchase(client, id);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id) values ($1, 'package.order_cancelled', 'package_purchase', $2)`, [adminId, id]);
      return upd.rows[0]!;
    });
    return toPurchase(row);
  }

  async adminPackages(): Promise<(PackageView & { isActive: boolean })[]> {
    const r = await this.db.query<PackageRow & { is_active: boolean }>(`select id, name, sessions_count, price_paise, original_price_paise, validity_days, badge, is_active from packages order by sort_order, sessions_count`);
    return r.rows.map((x) => ({ ...toPackage(x), isActive: x.is_active }));
  }

  async adminSavePackage(adminId: string, id: string | null, input: { name: string; sessionsCount: number; pricePaise: number; originalPricePaise?: number | null | undefined; validityDays?: number | null | undefined; badge?: string | null | undefined; isActive: boolean }): Promise<PackageView> {
    return this.db.tx(async (client) => {
      const vals = [input.name, input.sessionsCount, input.pricePaise, input.originalPricePaise ?? null, input.validityDays ?? null, input.badge || null, input.isActive];
      let r;
      if (id) {
        r = await client.query<PackageRow>(
          `update packages set name=$2, sessions_count=$3, price_paise=$4, original_price_paise=$5, validity_days=$6, badge=$7, is_active=$8 where id=$1
           returning id, name, sessions_count, price_paise, original_price_paise, validity_days, badge`, [id, ...vals]);
        if (!r.rows[0]) throw new DomainError('NOT_FOUND', 'Package not found.');
      } else {
        r = await client.query<PackageRow>(
          `insert into packages (name, sessions_count, price_paise, original_price_paise, validity_days, badge, is_active, sort_order)
           values ($1,$2,$3,$4,$5,$6,$7, (select coalesce(max(sort_order),0)+1 from packages))
           returning id, name, sessions_count, price_paise, original_price_paise, validity_days, badge`, vals);
      }
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, $2, 'package', $3, $4)`, [adminId, id ? 'package.updated' : 'package.created', r.rows[0]!.id, JSON.stringify(input)]);
      return toPackage(r.rows[0]!);
    });
  }

  // ---- exceptions (ops) ----
  // A customer could not use their package in time (a trainer let them down, an app problem, anything ops decide is fair).
  // Ops can add days to the end date, add sessions, or both. Always with a reason, always on the record, and the customer is told.
  async grantException(adminId: string, id: string, input: { extraSessions: number; extendDays: number; reason: string }): Promise<PurchaseView> {
    if (input.extraSessions === 0 && input.extendDays === 0) throw new DomainError('INVALID_REQUEST', 'Choose extra sessions, extra days, or both.');
    const row = await this.db.tx(async (client) => {
      const cur = (await client.query<PurchaseRow>(`select ${COLS} from package_purchases where id = $1 for update`, [id])).rows[0];
      if (!cur) throw new DomainError('NOT_FOUND', 'Order not found.');
      if (cur.status !== 'paid') throw new DomainError('INVALID_STATE', 'Only a paid package can be extended.');
      if (cur.expires_at === null) throw new DomainError('INVALID_STATE', 'This package never expires, so there is nothing to extend.');
      const expired = cur.expires_at.getTime() <= Date.now();
      // Sessions added to a package that has already ended could never be booked, so the end date has to move too.
      if (input.extraSessions > 0 && expired && input.extendDays === 0) throw new DomainError('INVALID_REQUEST', 'This package has ended. Add days as well, or the new session cannot be booked.');
      // New end date: from the old one if it is still running, from today if it already ended.
      const upd = await client.query<PurchaseRow>(
        `update package_purchases set credits_total = credits_total + $2,
                expires_at = case when $3 > 0 then greatest(expires_at, now()) + ($3 || ' days')::interval else expires_at end
          where id = $1 returning ${COLS}`,
        [id, input.extraSessions, input.extendDays],
      );
      const after = upd.rows[0]!;
      await client.query(
        `insert into audit_log (actor_user_id, action, entity_type, entity_id, before, after) values ($1, 'package.exception_granted', 'package_purchase', $2, $3, $4)`,
        [adminId, id, JSON.stringify({ creditsTotal: cur.credits_total, creditsUsed: cur.credits_used, expiresAt: cur.expires_at.toISOString() }),
         JSON.stringify({ reason: input.reason, extraSessions: input.extraSessions, extendDays: input.extendDays, creditsTotal: after.credits_total, expiresAt: after.expires_at?.toISOString() ?? null })],
      );
      const parts = [input.extraSessions > 0 ? `${input.extraSessions} extra session${input.extraSessions === 1 ? '' : 's'}` : null, input.extendDays > 0 ? `${input.extendDays} more day${input.extendDays === 1 ? '' : 's'}` : null].filter(Boolean).join(' and ');
      await notifyCustomer(client, cur.user_id, 'Your package was extended',
        `We added ${parts} to your ${cur.name} package. It is now valid until ${formatDay(after.expires_at!)} and you have ${after.credits_total - after.credits_used} session${after.credits_total - after.credits_used === 1 ? '' : 's'} left.`, null);
      return after;
    });
    return toPurchase(row);
  }

  async exceptionHistory(id: string): Promise<PackageException[]> {
    const r = await this.db.query<{ id: string; after: { reason?: string; extraSessions?: number; extendDays?: number; expiresAt?: string | null }; created_at: Date; name: string | null }>(
      `select a.id, a.after, a.created_at, coalesce(p.display_name, u.email, 'Admin') as name
         from audit_log a left join admin_profiles p on p.user_id = a.actor_user_id left join users u on u.id = a.actor_user_id
        where a.entity_type = 'package_purchase' and a.entity_id = $1 and a.action = 'package.exception_granted' order by a.created_at desc`, [id]);
    return r.rows.map((x) => ({ id: String(x.id), action: 'exception', reason: x.after.reason ?? '', extraSessions: x.after.extraSessions ?? 0, extendDays: x.after.extendDays ?? 0, expiresAt: x.after.expiresAt ?? null, by: x.name ?? 'Admin', at: x.created_at.toISOString() }));
  }

  // Used by bookings: take one credit from the paid package that expires first and still covers the session.
  // A package lasts 60 days from payment, and the session itself has to start before it ends. startsAt is null for an instant session.
  async takeCredit(client: PoolClient, userId: string, startsAt: Date | null): Promise<string> {
    const r = await client.query<{ id: string }>(
      `select id from package_purchases where user_id = $1 and status = 'paid' and credits_used < credits_total
          and (expires_at is null or (expires_at > now() and ($2::timestamptz is null or expires_at >= $2)))
        order by expires_at nulls last, created_at limit 1 for update`,
      [userId, startsAt],
    );
    const id = r.rows[0]?.id;
    if (!id) {
      // Credits that are still alive but end before this session: say so, so the customer can pick an earlier time.
      const short = startsAt ? (await client.query<{ expires_at: Date }>(
        `select max(expires_at) as expires_at from package_purchases where user_id = $1 and status = 'paid' and credits_used < credits_total and expires_at > now()`, [userId])).rows[0] : null;
      if (short?.expires_at) throw new DomainError('PACKAGE_EXPIRES', `Your package ends on ${formatDay(short.expires_at)}. Choose a time on or before that day.`);
      throw new DomainError('NO_CREDITS', 'You have no session credits left.');
    }
    await client.query(`update package_purchases set credits_used = credits_used + 1 where id = $1`, [id]);
    return id;
  }

  // A session already paid with a package can only be moved to a time the package still covers.
  async assertCovers(client: PoolClient, purchaseId: string, startsAt: Date): Promise<void> {
    const r = (await client.query<{ expires_at: Date | null }>(`select expires_at from package_purchases where id = $1`, [purchaseId])).rows[0];
    if (r?.expires_at && startsAt.getTime() > r.expires_at.getTime()) {
      throw new DomainError('PACKAGE_EXPIRES', `Your package ends on ${formatDay(r.expires_at)}. Choose a time on or before that day.`);
    }
  }

  async giveCreditBack(client: PoolClient, purchaseId: string): Promise<void> {
    await client.query(`update package_purchases set credits_used = greatest(0, credits_used - 1) where id = $1`, [purchaseId]);
  }
}
