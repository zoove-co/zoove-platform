import { Injectable } from '@nestjs/common';
import type { QueryResult, QueryResultRow } from 'pg';
import { randomInt } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';

// Either the pool (DatabaseService) or a transaction's client: both look like this.
type Queryable = { query: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<R>> };

export type DiscountKind = 'percent' | 'flat';
export type DiscountReason = 'goodwill' | 'emergency' | 'misconduct' | 'referral' | 'promo' | 'other';
export type AppliesTo = 'any' | 'session' | 'package';

export type DiscountQuote = {
  codeId: string;
  code: string;
  label: string; // "50% off", "₹200 off"
  listPaise: number;
  discountPaise: number;
  totalPaise: number;
};

type CodeRow = {
  id: string;
  code: string;
  kind: DiscountKind;
  percent_off: number | null;
  flat_off_paise: number | null;
  max_discount_paise: number | null;
  assigned_user_id: string | null;
  max_redemptions: number;
  per_user_limit: number;
  redemption_count: number;
  min_order_paise: number;
  applies_to: AppliesTo;
  valid_from: Date;
  expires_at: Date | null;
  disabled_at: Date | null;
};

const MAX_WRONG_GUESSES_PER_HOUR = 10;
// No 0/O, 1/I/L: a code read out over a call or typed from a message must not be misread.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const normaliseCode = (input: string): string => input.trim().toUpperCase().replace(/[\s-]/g, '');

export function generateCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

// How much comes off. Percent is rounded down to a whole paisa, capped if the code has a cap, and never more than the price.
export function discountAmount(row: Pick<CodeRow, 'kind' | 'percent_off' | 'flat_off_paise' | 'max_discount_paise'>, listPaise: number): number {
  const raw = row.kind === 'percent' ? Math.floor((listPaise * (row.percent_off ?? 0)) / 100) : (row.flat_off_paise ?? 0);
  const capped = row.max_discount_paise !== null ? Math.min(raw, row.max_discount_paise) : raw;
  return Math.max(0, Math.min(capped, listPaise));
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const labelOf = (row: CodeRow) => (row.kind === 'percent' ? `${row.percent_off}% off` : `${rupees(row.flat_off_paise ?? 0)} off`);

// The one place that decides whether a discount code works and how much it takes off. Used by booking checkout now,
// and by packages and referral rewards next.
@Injectable()
export class DiscountsService {
  // Checks a code for this customer and works out the new total. With `apply` it also records the use (call it inside the
  // booking's own transaction, so the booking and the use are saved together or not at all).
  async quote(
    db: Queryable,
    userId: string,
    rawCode: string,
    listPaise: number,
    appliesTo: 'session' | 'package',
    // true when the booking is being made: the code row is locked until the booking transaction ends, so two
    // simultaneous bookings cannot both use the last use of a code. Then call redeem() once the booking row exists.
    lock = false,
  ): Promise<DiscountQuote> {
    const code = normaliseCode(rawCode);

    const wrong = await db.query<{ count: string }>(
      `select count(*) from discount_attempts where user_id = $1 and created_at > now() - interval '1 hour'`,
      [userId],
    );
    if (Number(wrong.rows[0]?.count ?? 0) >= MAX_WRONG_GUESSES_PER_HOUR) {
      throw new DomainError('TOO_MANY_REQUESTS', 'Too many wrong codes. Please try again in a while.');
    }

    const found = await db.query<CodeRow>(`select * from discount_codes where code = $1${lock ? ' for update' : ''}`, [code]);
    const row = found.rows[0];
    const now = Date.now();
    // Unknown, switched off, not started, or meant for someone else: all look the same, so nobody can probe for codes.
    if (!row || row.disabled_at !== null || row.valid_from.getTime() > now || (row.assigned_user_id !== null && row.assigned_user_id !== userId)) {
      await db.query(`insert into discount_attempts (id, user_id) values ($1, $2)`, [uuidv7(), userId]);
      throw new DomainError('DISCOUNT_INVALID', 'That code is not valid.');
    }
    if (row.expires_at !== null && row.expires_at.getTime() <= now) throw new DomainError('DISCOUNT_EXPIRED', 'That code has expired.');

    const mine = await db.query<{ count: string }>(
      `select count(*) from discount_redemptions where code_id = $1 and user_id = $2 and released_at is null`,
      [row.id, userId],
    );
    if (row.redemption_count >= row.max_redemptions || Number(mine.rows[0]?.count ?? 0) >= row.per_user_limit) {
      throw new DomainError('DISCOUNT_USED', 'That code has already been used.');
    }
    if (row.applies_to !== 'any' && row.applies_to !== appliesTo) {
      throw new DomainError('DISCOUNT_NOT_APPLICABLE', appliesTo === 'session' ? 'That code is not for sessions.' : 'That code is not for packages.');
    }
    if (listPaise < row.min_order_paise) {
      throw new DomainError('DISCOUNT_NOT_APPLICABLE', `That code works on orders of ${rupees(row.min_order_paise)} or more.`, { minOrderPaise: row.min_order_paise });
    }

    const discountPaise = discountAmount(row, listPaise);
    return { codeId: row.id, code: row.code, label: labelOf(row), listPaise, discountPaise, totalPaise: listPaise - discountPaise };
  }

  // Records the use. Call it in the same transaction as the booking insert, after it (the use points at the booking).
  async redeem(db: Queryable, userId: string, quote: DiscountQuote, bookingId: string): Promise<void> {
    await db.query(`insert into discount_redemptions (id, code_id, user_id, booking_id, discount_paise) values ($1, $2, $3, $4, $5)`, [
      uuidv7(), quote.codeId, userId, bookingId, quote.discountPaise,
    ]);
    await db.query(`update discount_codes set redemption_count = redemption_count + 1 where id = $1`, [quote.codeId]);
  }

  // A cancelled booking gives its code back, so a customer is not punished for cancelling.
  async releaseForBooking(db: Queryable, bookingId: string): Promise<void> {
    const released = await db.query<{ code_id: string }>(
      `update discount_redemptions set released_at = now() where booking_id = $1 and released_at is null returning code_id`,
      [bookingId],
    );
    const row = released.rows[0];
    if (row) await db.query(`update discount_codes set redemption_count = greatest(0, redemption_count - 1) where id = $1`, [row.code_id]);
  }
}
