import { Injectable } from '@nestjs/common';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { BOOKING_MODES, type BookingMode } from './pricing.service';

export type AdminFormat = { id: string; slug: string; name: string; description: string | null; sortOrder: number; isActive: boolean };
export type PriceCell = { pricePaise: number } | null;
export type AdminService = {
  id: string; slug: string; name: string; tagline: string | null; durationMinMinutes: number; durationMaxMinutes: number;
  intensity: string | null; sortOrder: number; isActive: boolean; formats: AdminFormat[];
  // Only a price set for this one service. Empty means "use the default price".
  ownPrices: Record<BookingMode, PriceCell>;
};
export type ParticipantRule = { participant: 'duo' | 'loved_one' | 'group'; percent: number; perHead: boolean; isPlaceholder: boolean };
export type Offerings = { services: AdminService[]; defaultPrices: Record<BookingMode, PriceCell>; participants: ParticipantRule[] };

export type ServiceInput = {
  name: string; tagline?: string | null | undefined; durationMinMinutes: number; durationMaxMinutes: number;
  intensity?: string | null | undefined; sortOrder: number; isActive: boolean;
};
export type FormatInput = { name: string; description?: string | null | undefined; sortOrder: number; isActive: boolean };

const emptyPrices = (): Record<BookingMode, PriceCell> => ({ instant: null, scheduled: null, demo: null });

// The catalog is data. Everything the customer app shows (services, styles, prices, Duo/Group) is edited here and read
// live from the same tables by GET /v1/services and by the booking engine, so a change here is what customers see and pay.
// Nothing is deleted: services and styles are switched off instead, so old bookings keep their history.
@Injectable()
export class CatalogAdminService {
  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<Offerings> {
    const services = await this.db.query<{ id: string; slug: string; name: string; tagline: string | null; duration_min_minutes: number; duration_max_minutes: number; intensity: string | null; sort_order: number; is_active: boolean }>(
      `select id, slug, name, tagline, duration_min_minutes, duration_max_minutes, intensity, sort_order, is_active from services order by sort_order, name`,
    );
    const formats = await this.db.query<{ id: string; service_id: string; slug: string; name: string; description: string | null; sort_order: number; is_active: boolean }>(
      `select id, service_id, slug, name, description, sort_order, is_active from service_formats order by sort_order, name`,
    );
    const prices = await this.db.query<{ service_id: string | null; mode: BookingMode; price_paise: number }>(
      `select service_id, mode::text as mode, price_paise from service_prices where is_active`,
    );
    const rules = await this.db.query<{ participant: ParticipantRule['participant']; percent_of_personal: number; per_head: boolean; is_placeholder: boolean }>(
      `select participant, percent_of_personal, per_head, is_placeholder from participant_pricing
        order by case participant when 'duo' then 1 when 'loved_one' then 2 else 3 end`,
    );
    const defaultPrices = emptyPrices();
    const own = new Map<string, Record<BookingMode, PriceCell>>();
    for (const p of prices.rows) {
      if (p.service_id === null) defaultPrices[p.mode] = { pricePaise: Number(p.price_paise) };
      else {
        const cell = own.get(p.service_id) ?? emptyPrices();
        cell[p.mode] = { pricePaise: Number(p.price_paise) };
        own.set(p.service_id, cell);
      }
    }
    return {
      services: services.rows.map((s) => ({
        id: s.id, slug: s.slug, name: s.name, tagline: s.tagline, durationMinMinutes: s.duration_min_minutes, durationMaxMinutes: s.duration_max_minutes,
        intensity: s.intensity, sortOrder: s.sort_order, isActive: s.is_active,
        formats: formats.rows.filter((f) => f.service_id === s.id).map((f) => ({ id: f.id, slug: f.slug, name: f.name, description: f.description, sortOrder: f.sort_order, isActive: f.is_active })),
        ownPrices: own.get(s.id) ?? emptyPrices(),
      })),
      defaultPrices,
      participants: rules.rows.map((r) => ({ participant: r.participant, percent: Number(r.percent_of_personal), perHead: r.per_head, isPlaceholder: r.is_placeholder })),
    };
  }

  async saveService(adminId: string, id: string | null, slug: string | null, input: ServiceInput): Promise<{ id: string }> {
    if (input.durationMaxMinutes < input.durationMinMinutes) throw new DomainError('INVALID_REQUEST', 'The longest length cannot be shorter than the shortest.');
    return this.db.tx(async (client) => {
      if (id) {
        const cur = await client.query(`select id, is_active from services where id = $1 for update`, [id]);
        if (!cur.rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that service.');
        await client.query(
          `update services set name = $2, tagline = $3, duration_min_minutes = $4, duration_max_minutes = $5, intensity = $6, sort_order = $7, is_active = $8 where id = $1`,
          [id, input.name, input.tagline ?? null, input.durationMinMinutes, input.durationMaxMinutes, input.intensity ?? null, input.sortOrder, input.isActive],
        );
        await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'catalog.service_updated', 'service', $2, $3)`, [adminId, id, JSON.stringify(input)]);
        return { id };
      }
      const taken = await client.query(`select 1 from services where slug = $1`, [slug]);
      if (taken.rows[0]) throw new DomainError('INVALID_REQUEST', 'A service with that web name already exists.');
      const ins = await client.query<{ id: string }>(
        `insert into services (slug, name, tagline, duration_min_minutes, duration_max_minutes, intensity, sort_order, is_active)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [slug, input.name, input.tagline ?? null, input.durationMinMinutes, input.durationMaxMinutes, input.intensity ?? null, input.sortOrder, input.isActive],
      );
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'catalog.service_created', 'service', $2, $3)`, [adminId, ins.rows[0]!.id, JSON.stringify({ slug, ...input })]);
      return { id: ins.rows[0]!.id };
    });
  }

  async saveFormat(adminId: string, serviceId: string, formatId: string | null, slug: string | null, input: FormatInput): Promise<{ id: string }> {
    return this.db.tx(async (client) => {
      if (!(await client.query(`select 1 from services where id = $1`, [serviceId])).rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that service.');
      if (formatId) {
        const upd = await client.query(
          `update service_formats set name = $3, description = $4, sort_order = $5, is_active = $6 where id = $1 and service_id = $2 returning id`,
          [formatId, serviceId, input.name, input.description ?? null, input.sortOrder, input.isActive],
        );
        if (!upd.rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that style.');
        await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'catalog.format_updated', 'service_format', $2, $3)`, [adminId, formatId, JSON.stringify(input)]);
        return { id: formatId };
      }
      if ((await client.query(`select 1 from service_formats where service_id = $1 and slug = $2`, [serviceId, slug])).rows[0]) {
        throw new DomainError('INVALID_REQUEST', 'This service already has a style with that web name.');
      }
      const ins = await client.query<{ id: string }>(
        `insert into service_formats (service_id, slug, name, description, sort_order, is_active) values ($1, $2, $3, $4, $5, $6) returning id`,
        [serviceId, slug, input.name, input.description ?? null, input.sortOrder, input.isActive],
      );
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'catalog.format_created', 'service_format', $2, $3)`, [adminId, ins.rows[0]!.id, JSON.stringify({ slug, ...input })]);
      return { id: ins.rows[0]!.id };
    });
  }

  // serviceId null = the default price for every service. pricePaise null removes a service's own price (the default applies again).
  async setPrice(adminId: string, serviceId: string | null, mode: BookingMode, pricePaise: number | null): Promise<void> {
    if (!BOOKING_MODES.includes(mode)) throw new DomainError('INVALID_REQUEST', 'Unknown session type.');
    if (serviceId === null && pricePaise === null) throw new DomainError('INVALID_REQUEST', 'The default price cannot be removed, or services without their own price could not be booked.');
    await this.db.tx(async (client) => {
      if (serviceId && !(await client.query(`select 1 from services where id = $1`, [serviceId])).rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that service.');
      const before = (await client.query<{ price_paise: number }>(
        `select price_paise from service_prices where is_active and mode = $2::booking_mode and service_id is not distinct from $1 for update`, [serviceId, mode])).rows[0];
      await client.query(`update service_prices set is_active = false where is_active and mode = $2::booking_mode and service_id is not distinct from $1`, [serviceId, mode]);
      if (pricePaise !== null) {
        await client.query(`insert into service_prices (service_id, mode, price_paise) values ($1, $2::booking_mode, $3)`, [serviceId, mode, pricePaise]);
      }
      await client.query(
        `insert into audit_log (actor_user_id, action, entity_type, entity_id, before, after) values ($1, 'catalog.price_set', 'service_price', $2, $3, $4)`,
        [adminId, serviceId, JSON.stringify({ mode, pricePaise: before ? Number(before.price_paise) : null }), JSON.stringify({ mode, pricePaise })],
      );
    });
  }

  async setParticipantRule(adminId: string, participant: string, percent: number, perHead: boolean): Promise<void> {
    await this.db.tx(async (client) => {
      const upd = await client.query(
        `update participant_pricing set percent_of_personal = $2, per_head = $3, is_placeholder = false, updated_at = now() where participant = $1 returning participant`, [participant, percent, perHead]);
      if (!upd.rows[0]) throw new DomainError('NOT_FOUND', 'Unknown session group.');
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, after) values ($1, 'catalog.participant_price_set', 'participant_pricing', $2)`, [adminId, JSON.stringify({ participant, percent, perHead })]);
    });
  }
}
