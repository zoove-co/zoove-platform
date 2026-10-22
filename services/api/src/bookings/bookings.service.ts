import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { AddressesService } from '../addresses/addresses.service';
import { CatalogService } from '../catalog/catalog.service';
import { PricingService, type BookingMode } from '../catalog/pricing.service';
import { DomainError } from '../common/domain-error';
import { lockFor } from '../common/locks';
import { DatabaseService } from '../database/database.service';
import { CHANGE_WINDOW_MS, dayRange, formatClock, formatWhen, isSlotStart, slotStarts, withinHorizon } from './rules';

export type BookingStatus = 'matching' | 'confirmed' | 'rematching' | 'completed' | 'cancelled';

export type Booking = {
  id: string;
  serviceSlug: string;
  serviceName: string;
  formatName: string;
  mode: BookingMode;
  status: BookingStatus;
  startsAt: string | null;
  coach: { id: string; name: string } | null;
  whenLabel: string;
  addressLabel: string;
  areaLabel: string;
  totalPaise: number;
  canChange: boolean;
};

export type TimeSlot = { id: string; startsAt: string; label: string; available: boolean };

export type CreateBookingInput = {
  serviceSlug: string;
  formatSlug: string;
  mode: BookingMode;
  participant: 'personal';
  addressId: string;
  startsAt?: string;
  preferredCoachId?: string;
  idempotencyKey: string;
};

type Row = {
  id: string;
  mode: BookingMode;
  status: BookingStatus;
  starts_at: Date | null;
  address_label: string;
  address_area: string | null;
  total_paise: number;
  service_slug: string;
  service_name: string;
  format_name: string;
  request_fingerprint: string;
};

const SELECT = `select b.id, b.mode, b.status, b.starts_at, b.address_label, b.address_area, b.total_paise,
                       b.request_fingerprint, s.slug as service_slug, s.name as service_name, f.name as format_name
                  from bookings b
                  join services s on s.id = b.service_id
                  join service_formats f on f.id = b.format_id`;

const ACTIVE = `('matching', 'confirmed', 'rematching')`;

// The 2-hour rule lives here and nowhere else (assumption, question 7). While we are still finding a coach
// the customer can always change or cancel.
export function canChange(status: BookingStatus, startsAt: Date | null, now: Date): boolean {
  if (status === 'matching' || status === 'rematching') return true;
  if (status !== 'confirmed' || !startsAt) return false;
  return startsAt.getTime() - now.getTime() >= CHANGE_WINDOW_MS;
}

const isUnique = (error: unknown, constraint: string): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505' &&
  (error as { constraint?: string }).constraint === constraint;

@Injectable()
export class BookingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
    private readonly addresses: AddressesService,
  ) {}

  private toBooking(row: Row, now = new Date()): Booking {
    return {
      id: row.id,
      serviceSlug: row.service_slug,
      serviceName: row.service_name,
      formatName: row.format_name,
      mode: row.mode,
      status: row.status,
      startsAt: row.starts_at ? row.starts_at.toISOString() : null,
      // Coaches arrive with the trainer and matching modules.
      coach: null,
      whenLabel: row.starts_at ? formatWhen(row.starts_at) : row.mode === 'instant' ? 'Finding your coach' : 'To be scheduled',
      addressLabel: row.address_label,
      areaLabel: row.address_area ?? '',
      totalPaise: row.total_paise,
      canChange: canChange(row.status, row.starts_at, now),
    };
  }

  async list(userId: string): Promise<Booking[]> {
    const result = await this.db.query<Row>(`${SELECT} where b.user_id = $1 order by b.created_at desc limit 200`, [userId]);
    const now = new Date();
    return result.rows.map((row) => this.toBooking(row, now));
  }

  async get(userId: string, id: string): Promise<Booking> {
    const result = await this.db.query<Row>(`${SELECT} where b.id = $1 and b.user_id = $2`, [id, userId]);
    const row = result.rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'We could not find that booking.');
    return this.toBooking(row);
  }

  async slots(userId: string, serviceSlug: string, isoDate: string): Promise<TimeSlot[]> {
    const range = dayRange(isoDate);
    if (!range) throw new DomainError('INVALID_REQUEST', 'Use a date like 2026-10-25.');
    if (!(await this.catalog.findService(this.db, serviceSlug))) throw new DomainError('NOT_FOUND', 'We could not find that service.');
    const busy = await this.db.query<{ starts_at: Date }>(
      `select starts_at from bookings where user_id = $1 and status in ${ACTIVE} and starts_at >= $2 and starts_at < $3`,
      [userId, range.start, range.end],
    );
    const taken = new Set(busy.rows.map((row) => row.starts_at.getTime()));
    const now = new Date();
    return slotStarts(isoDate).map(({ time, startsAt }) => ({
      id: `${isoDate}-${time}`,
      startsAt: startsAt.toISOString(),
      label: formatClock(startsAt),
      available: startsAt.getTime() > now.getTime() && withinHorizon(startsAt, now) && !taken.has(startsAt.getTime()),
    }));
  }

  async create(userId: string, input: CreateBookingInput): Promise<Booking> {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([input.serviceSlug, input.formatSlug, input.mode, input.participant, input.addressId, input.startsAt ?? null, input.preferredCoachId ?? null]))
      .digest('hex');
    try {
      const id = await this.db.tx(async (client) => {
        await lockFor(client, 'booking', userId);

        // A retry with the same key returns the same booking and never creates a second one.
        const replay = await client.query<{ id: string; request_fingerprint: string }>(
          `select id, request_fingerprint from bookings where user_id = $1 and idempotency_key = $2`,
          [userId, input.idempotencyKey],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].request_fingerprint !== fingerprint) {
            throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This request key was already used for a different booking.');
          }
          return replay.rows[0].id;
        }

        const service = await this.catalog.findService(client, input.serviceSlug);
        if (!service) throw new DomainError('NOT_FOUND', 'We could not find that service.');
        const format = await this.catalog.findFormat(client, service.id, input.formatSlug);
        if (!format) throw new DomainError('NOT_FOUND', 'We could not find that style.');

        const address = await this.addresses.findOwned(client, userId, input.addressId);
        if (!address) throw new DomainError('ADDRESS_NOT_FOUND', 'We could not find that address.');
        if (!address.serviceable) throw new DomainError('NOT_SERVICEABLE', 'We do not serve this area yet.');

        let startsAt: Date | null = null;
        if (input.mode !== 'instant') {
          startsAt = this.assertBookableSlot(input.startsAt);
        }

        const total = await this.pricing.priceFor(client, service.id, input.mode);
        if (total === null) throw new DomainError('INTERNAL', 'No price is set for this session.');

        const bookingId = uuidv7();
        await client.query(
          `insert into bookings (id, user_id, service_id, format_id, mode, address_id, address_label, address_line,
                                 address_area, address_pincode, starts_at, status, preferred_coach_id, total_paise,
                                 idempotency_key, request_fingerprint)
           values ($1, $2, $3, $4, $5::booking_mode, $6, $7, $8, $9, $10, $11, 'matching', $12, $13, $14, $15)`,
          [bookingId, userId, service.id, format.id, input.mode, address.id, address.label, address.line, address.area,
           address.pincode, startsAt, input.preferredCoachId ?? null, total, input.idempotencyKey, fingerprint],
        );
        await this.record(client, bookingId, 'created', 'customer', { mode: input.mode, startsAt: startsAt?.toISOString() ?? null });
        await this.publish(client, bookingId, 'booking.created', {
          bookingId, userId, serviceSlug: service.slug, mode: input.mode, startsAt: startsAt?.toISOString() ?? null, totalPaise: total,
        });
        return bookingId;
      });
      return this.get(userId, id);
    } catch (error) {
      if (isUnique(error, 'bookings_no_double_booking')) throw new DomainError('SLOT_CONFLICT', 'You already have a session at that time.');
      throw error;
    }
  }

  async reschedule(userId: string, id: string, startsAtInput: string): Promise<Booking> {
    try {
      await this.db.tx(async (client) => {
        const row = await this.lock(client, userId, id);
        if (row.mode === 'instant' || !canChange(row.status, row.starts_at, new Date())) {
          throw new DomainError('CHANGE_WINDOW_CLOSED', 'This session can no longer be changed.');
        }
        const startsAt = this.assertBookableSlot(startsAtInput);
        await client.query(`update bookings set starts_at = $2 where id = $1`, [id, startsAt]);
        await this.record(client, id, 'rescheduled', 'customer', { from: row.starts_at?.toISOString() ?? null, to: startsAt.toISOString() });
        await this.publish(client, id, 'booking.rescheduled', { bookingId: id, userId, to: startsAt.toISOString() });
      });
    } catch (error) {
      if (isUnique(error, 'bookings_no_double_booking')) throw new DomainError('SLOT_CONFLICT', 'You already have a session at that time.');
      throw error;
    }
    return this.get(userId, id);
  }

  async cancel(userId: string, id: string): Promise<Booking> {
    await this.db.tx(async (client) => {
      const row = await this.lock(client, userId, id);
      // Cancelling twice is not an error: the second call changes nothing.
      if (row.status === 'cancelled') return;
      if (!canChange(row.status, row.starts_at, new Date())) {
        throw new DomainError('CHANGE_WINDOW_CLOSED', 'This session can no longer be cancelled.');
      }
      await client.query(`update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer' where id = $1`, [id]);
      await this.record(client, id, 'cancelled', 'customer', {});
      await this.publish(client, id, 'booking.cancelled', { bookingId: id, userId, by: 'customer' });
    });
    return this.get(userId, id);
  }

  private assertBookableSlot(value: string | undefined): Date {
    const startsAt = value ? new Date(value) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) throw new DomainError('INVALID_REQUEST', 'Choose a time for your session.');
    const now = new Date();
    if (startsAt.getTime() <= now.getTime() || !withinHorizon(startsAt, now) || !isSlotStart(startsAt)) {
      throw new DomainError('SLOT_UNAVAILABLE', 'That time is not available. Please pick another.');
    }
    return startsAt;
  }

  private async lock(client: PoolClient, userId: string, id: string): Promise<Row> {
    const result = await client.query<Row>(`${SELECT} where b.id = $1 and b.user_id = $2 for update of b`, [id, userId]);
    const row = result.rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'We could not find that booking.');
    return row;
  }

  private async record(client: PoolClient, bookingId: string, type: string, actor: string, payload: object): Promise<void> {
    await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, $3, $4, $5)`, [
      uuidv7(), bookingId, type, actor, JSON.stringify(payload),
    ]);
  }

  // Transactional outbox (D6): written in the same transaction, delivered later by a worker.
  private async publish(client: PoolClient, bookingId: string, eventType: string, payload: object): Promise<void> {
    await client.query(
      `insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, $3, $4)`,
      [uuidv7(), bookingId, eventType, JSON.stringify(payload)],
    );
  }
}
