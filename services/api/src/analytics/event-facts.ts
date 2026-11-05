import type { Pool, PoolClient } from 'pg';

import type { Aggregate, Facts } from './event-catalog';

type Db = Pick<Pool | PoolClient, 'query'>;

// Reads the safe facts for a batch of things (bookings, package orders...) in one query per kind.
// This is the only place that decides which columns may be shared with outside tools.
export async function loadFacts(db: Db, aggregate: Aggregate, ids: string[]): Promise<Map<string, Facts>> {
  const out = new Map<string, Facts>();
  if (ids.length === 0) return out;

  if (aggregate === 'booking') {
    const r = await db.query<{ id: string; user_id: string; mode: string; participant: string; total_paise: number; address_area: string | null; service_slug: string; format_slug: string; starts_at: Date | null }>(
      `select b.id, b.user_id, b.mode, b.participant, b.total_paise, b.address_area, s.slug as service_slug, f.slug as format_slug, b.starts_at
         from bookings b join services s on s.id = b.service_id join service_formats f on f.id = b.format_id where b.id = any($1::uuid[])`, [ids]);
    for (const x of r.rows) {
      out.set(x.id, { userId: x.user_id, properties: { booking_id: x.id, service_slug: x.service_slug, format_slug: x.format_slug, mode: x.mode, booking_for: x.participant, amount_paise: x.total_paise, area: x.address_area, starts_at: x.starts_at ? x.starts_at.toISOString() : null } });
    }
  } else if (aggregate === 'package_purchase') {
    const r = await db.query<{ id: string; user_id: string; package_id: string | null; total_paise: number; sessions_count: number }>(
      `select id, user_id, package_id, total_paise, sessions_count from package_purchases where id = any($1::uuid[])`, [ids]);
    for (const x of r.rows) out.set(x.id, { userId: x.user_id, properties: { purchase_id: x.id, package_id: x.package_id, sessions_count: x.sessions_count, amount_paise: x.total_paise } });
  } else if (aggregate === 'party_request') {
    const r = await db.query<{ id: string; user_id: string; occasion: string; guests: number; service_slug: string }>(
      `select id, user_id, occasion, guests, service_slug from party_requests where id = any($1::uuid[])`, [ids]);
    for (const x of r.rows) out.set(x.id, { userId: x.user_id, properties: { request_id: x.id, occasion: x.occasion, guests: x.guests, service_slug: x.service_slug } });
  } else {
    // 'user': the aggregate id is the customer. Only customers who still have an account are sent.
    const r = await db.query<{ id: string }>(`select id from users where id = any($1::uuid[]) and status = 'active'`, [ids]);
    for (const x of r.rows) out.set(x.id, { userId: x.id, properties: {} });
  }
  return out;
}
