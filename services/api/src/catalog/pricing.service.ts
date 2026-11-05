import { Injectable } from '@nestjs/common';

export type BookingMode = 'instant' | 'scheduled' | 'demo';
export const BOOKING_MODES: BookingMode[] = ['instant', 'scheduled', 'demo'];
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

// Prices are records (decision D13). A price set for one service wins over the default price for all services.
@Injectable()
export class PricingService {
  async priceFor(db: Queryable, serviceId: string, mode: BookingMode): Promise<number | null> {
    const result = await db.query(
      `select price_paise from service_prices
        where is_active and mode = $2::booking_mode and (service_id = $1 or service_id is null)
        order by (service_id is null)
        limit 1`,
      [serviceId, mode],
    );
    const row = result.rows[0];
    return row ? Number(row.price_paise) : null;
  }

  // Duo, Loved one and Group are a share of the Personal price (table participant_pricing, placeholders until the
  // business answers open questions 5, 8, 9). Group is priced per person.
  async priceForParticipant(db: Queryable, serviceId: string, mode: BookingMode, participant: string, groupSize: number | null): Promise<number | null> {
    const base = await this.priceFor(db, serviceId, mode);
    if (base === null || participant === 'personal') return base;
    const rule = (await db.query(`select percent_of_personal, per_head from participant_pricing where participant = $1`, [participant])).rows[0];
    if (!rule) return base;
    return participantPrice(base, Number(rule.percent_of_personal), rule.per_head === true, participant === 'group' ? groupSize ?? 1 : 1);
  }

  async participantRules(db: Queryable): Promise<ParticipantRules> {
    const rows = (await db.query(`select participant, percent_of_personal, per_head from participant_pricing`)).rows;
    return Object.fromEntries(rows.map((r) => [String(r.participant), { percent: Number(r.percent_of_personal), perHead: r.per_head === true }]));
  }
}

export type ParticipantRules = Record<string, { percent: number; perHead: boolean }>;

// Whole paise, rounded to the nearest rupee so a customer never sees paise in a price.
export function participantPrice(basePaise: number, percent: number, perHead: boolean, people: number): number {
  const raw = (basePaise * percent) / 100 * (perHead ? people : 1);
  return Math.round(raw / 100) * 100;
}
