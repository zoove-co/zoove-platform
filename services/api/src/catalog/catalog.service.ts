import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { BOOKING_MODES, type BookingMode } from './pricing.service';

export type CatalogFormat = { slug: string; name: string; description: string | null };
export type CatalogItem = {
  slug: string;
  name: string;
  tagline: string | null;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  intensity: string | null;
  formats: CatalogFormat[];
  // Rupees are never used: paise only. Set in the admin panel (D13); the app only displays them.
  pricePaise: Record<BookingMode, number | null>;
};

type Row = {
  slug: string;
  name: string;
  tagline: string | null;
  duration_min_minutes: number;
  duration_max_minutes: number;
  intensity: string | null;
  formats: CatalogFormat[];
};

// Services and their styles are data: adding Pilates or a new vertical is an admin change, not a release.
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

@Injectable()
export class CatalogService {
  constructor(private readonly db: DatabaseService) {}

  async listServices(): Promise<CatalogItem[]> {
    const result = await this.db.query<Row>(
      `select s.slug, s.name, s.tagline, s.duration_min_minutes, s.duration_max_minutes, s.intensity,
              coalesce(
                json_agg(json_build_object('slug', f.slug, 'name', f.name, 'description', f.description)
                         order by f.sort_order) filter (where f.id is not null),
                '[]'::json
              ) as formats
         from services s
         left join service_formats f on f.service_id = s.id and f.is_active
        where s.is_active
        group by s.id
        order by s.sort_order, s.name`,
    );
    const prices = await this.db.query<{ slug: string; mode: BookingMode; price: number | null }>(
      `select s.slug, m.mode::text as mode,
              (select p.price_paise from service_prices p
                where p.is_active and p.mode = m.mode and (p.service_id = s.id or p.service_id is null)
                order by (p.service_id is null) limit 1) as price
         from services s
        cross join (select unnest(enum_range(null::booking_mode)) as mode) m
        where s.is_active`,
    );
    const priceBySlug = new Map<string, Record<BookingMode, number | null>>();
    for (const row of prices.rows) {
      const entry = priceBySlug.get(row.slug) ?? { instant: null, scheduled: null, demo: null };
      entry[row.mode] = row.price === null ? null : Number(row.price);
      priceBySlug.set(row.slug, entry);
    }
    return result.rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      tagline: row.tagline,
      durationMinMinutes: row.duration_min_minutes,
      durationMaxMinutes: row.duration_max_minutes,
      intensity: row.intensity,
      formats: row.formats,
      pricePaise: priceBySlug.get(row.slug) ?? Object.fromEntries(BOOKING_MODES.map((m) => [m, null])) as Record<BookingMode, number | null>,
    }));
  }

  // Used by the booking module so it never reads the catalog tables itself.
  async findService(db: Queryable, slug: string): Promise<{ id: string; slug: string; name: string } | null> {
    const result = await db.query(`select id, slug, name from services where slug = $1 and is_active`, [slug]);
    const row = result.rows[0];
    return row ? { id: String(row.id), slug: String(row.slug), name: String(row.name) } : null;
  }

  async findFormat(db: Queryable, serviceId: string, slug: string): Promise<{ id: string; name: string } | null> {
    const result = await db.query(
      `select id, name from service_formats where service_id = $1 and slug = $2 and is_active`,
      [serviceId, slug],
    );
    const row = result.rows[0];
    return row ? { id: String(row.id), name: String(row.name) } : null;
  }
}
