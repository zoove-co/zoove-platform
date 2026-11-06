import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { AddressesService } from '../addresses/addresses.service';
import { CatalogService } from '../catalog/catalog.service';
import { PackagesService } from '../packages/packages.service';
import { ReferralService } from '../referral/referral.service';
import { PricingService, type BookingMode } from '../catalog/pricing.service';
import { notifyCustomer } from '../customer/notify';
import { DomainError } from '../common/domain-error';
import { lockFor } from '../common/locks';
import { queueTrainerAlert } from '../notifications/trainer-alerts';
import { DatabaseService } from '../database/database.service';
import { DiscountsService, normaliseCode } from '../discounts/discounts.service';
import { CHANGE_WINDOW_MS, dayRange, formatClock, formatWhen, isSlotStart, slotStarts, withinHorizon } from './rules';
import { trainerBusySql } from './trainer-clash';

export type Participant = 'personal' | 'duo' | 'loved_one' | 'group';

export type BookingStatus = 'matching' | 'confirmed' | 'rematching' | 'completed' | 'cancelled';

export type Booking = {
  id: string;
  serviceSlug: string;
  serviceName: string;
  formatName: string;
  mode: BookingMode;
  participant: Participant;
  groupSize: number | null;
  recipient: { name: string; phone: string } | null;
  status: BookingStatus;
  startsAt: string | null;
  coach: { id: string; name: string } | null;
  // Short code the customer and the ops team both use to talk about this session, for example ZV-3F9A21BC.
  sessionCode: string;
  // The trainer cancelled and we are finding another one. The customer can wait, reschedule or cancel.
  trainerCancelled: boolean;
  // The start time has passed and no coach is on the session, or an instant session nobody took in time. The customer can pick a date or cancel.
  overdue: boolean;
  whenLabel: string;
  addressLabel: string;
  areaLabel: string;
  totalPaise: number; // what the customer pays, after any discount
  discountPaise: number;
  discountCode: string | null;
  paidWithCredit: boolean;
  canChange: boolean;
  // Live: the trainer entered the start code. Not derived from the clock any more.
  inProgress: boolean;
  startedAt: string | null;
  // When the session's timer ends (set at check-in). The finish code appears once it has passed.
  endsAt: string | null;
  // The customer shows this to the trainer on arrival (until the session is live).
  startCode: string | null;
  // The customer shows this to the trainer when the training is over (only while the session is live).
  endCode: string | null;
  // 1 to 5 once the customer rated a finished session.
  rating: number | null;
  canRate: boolean;
};

export type TimeSlot = { id: string; startsAt: string; label: string; available: boolean };

export type CreateBookingInput = {
  serviceSlug: string;
  formatSlug: string;
  mode: BookingMode;
  participant: Participant;
  groupSize?: number;
  recipient?: { name: string; phone: string };
  addressId: string;
  startsAt?: string;
  preferredCoachId?: string;
  discountCode?: string;
  useCredit?: boolean;
  idempotencyKey: string;
};

export type Row = {
  id: string;
  mode: BookingMode;
  participant: Participant;
  group_size: number | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  status: BookingStatus;
  starts_at: Date | null;
  address_label: string;
  address_area: string | null;
  total_paise: number;
  discount_paise: number;
  discount_code: string | null;
  package_purchase_id: string | null;
  service_slug: string;
  service_name: string;
  format_name: string;
  duration_max_minutes: number;
  request_fingerprint: string;
  trainer_cancelled_at: Date | null;
  unfilled_notified_at: Date | null;
  coach_id: string | null;
  coach_name: string | null;
  started_at: Date | null;
  ends_at: Date | null;
  start_code: string;
  end_code: string;
  rating_stars: number | null;
};

// ZV- plus the last 8 characters of the booking id. The ops list searches by the same rule.
export const sessionCodeOf = (id: string): string => `ZV-${id.replace(/-/g, '').slice(-8).toUpperCase()}`;

export const BOOKING_SELECT = `select b.id, b.mode, b.participant, b.group_size, b.recipient_name, b.recipient_phone, b.status, b.starts_at, b.address_label, b.address_area, b.total_paise, b.discount_paise, b.discount_code, b.package_purchase_id,
                       b.request_fingerprint, b.trainer_cancelled_at, b.unfilled_notified_at, b.coach_id, b.started_at, b.ends_at, b.start_code, b.end_code, (select r.stars from session_ratings r where r.booking_id = b.id) as rating_stars, coalesce(c.full_name, (select ta.first_name from trainers t join trainer_applications ta on ta.id = t.application_id where t.user_id = b.coach_id)) as coach_name,
                       s.slug as service_slug, s.name as service_name, f.name as format_name, s.duration_max_minutes
                  from bookings b
                  join services s on s.id = b.service_id
                  join service_formats f on f.id = b.format_id
                  left join users c on c.id = b.coach_id`;

const ACTIVE = `('matching', 'confirmed', 'rematching')`;

// The 2-hour rule lives here and nowhere else (assumption, question 7). While we are still finding a coach
// the customer can always change or cancel.
export function canChange(status: BookingStatus, startsAt: Date | null, now: Date): boolean {
  if (status === 'matching' || status === 'rematching') return true;
  if (status !== 'confirmed' || !startsAt) return false;
  return startsAt.getTime() - now.getTime() >= CHANGE_WINDOW_MS;
}

export function isInProgress(status: BookingStatus, startedAt: Date | null): boolean {
  return status === 'confirmed' && startedAt !== null;
}

export function bookingFromRow(row: Row, now = new Date()): Booking {
  return {
    id: row.id,
    serviceSlug: row.service_slug,
    serviceName: row.service_name,
    formatName: row.format_name,
    mode: row.mode,
    participant: row.participant,
    groupSize: row.group_size,
    recipient: row.recipient_name && row.recipient_phone ? { name: row.recipient_name, phone: row.recipient_phone } : null,
    status: row.status,
    startsAt: row.starts_at ? row.starts_at.toISOString() : null,
    // Only the first name is shown to the customer.
    coach: row.coach_id && row.status === 'confirmed' ? { id: row.coach_id, name: (row.coach_name ?? 'Your trainer').split(' ')[0] ?? 'Your trainer' } : null,
    sessionCode: sessionCodeOf(row.id),
    trainerCancelled: row.status === 'rematching' && row.trainer_cancelled_at !== null,
    overdue: (row.status === 'matching' || row.status === 'rematching') &&
      ((row.starts_at !== null && row.starts_at.getTime() <= now.getTime()) || (row.mode === 'instant' && row.unfilled_notified_at !== null)),
    whenLabel: row.starts_at ? formatWhen(row.starts_at) : row.mode === 'instant' ? 'Finding your coach' : 'To be scheduled',
    addressLabel: row.address_label,
    areaLabel: row.address_area ?? '',
    totalPaise: row.total_paise,
    discountPaise: row.discount_paise,
    discountCode: row.discount_code,
    paidWithCredit: row.package_purchase_id !== null,
    canChange: canChange(row.status, row.starts_at, now),
    inProgress: isInProgress(row.status, row.started_at),
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    endsAt: row.ends_at ? row.ends_at.toISOString() : null,
    startCode: row.status === 'confirmed' && row.started_at === null ? row.start_code : null,
    endCode: row.status === 'confirmed' && row.started_at !== null ? row.end_code : null,
    rating: row.rating_stars,
    canRate: row.status === 'completed' && row.coach_id !== null && row.rating_stars === null,
  };
}

// A session can only be booked or moved to a real start time (one of the app's slots), in the future, within the booking horizon.
export function assertBookableSlot(value: string | undefined): Date {
  const startsAt = value ? new Date(value) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) throw new DomainError('INVALID_REQUEST', 'Choose a time for your session.');
  const now = new Date();
  if (startsAt.getTime() <= now.getTime() || !withinHorizon(startsAt, now) || !isSlotStart(startsAt)) {
    throw new DomainError('SLOT_UNAVAILABLE', 'That time is not available. Please pick another.');
  }
  return startsAt;
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
    private readonly discounts: DiscountsService,
    private readonly packages: PackagesService,
    private readonly referral: ReferralService,
  ) {}

  private toBooking(row: Row, now = new Date()): Booking {
    return bookingFromRow(row, now);
  }

  async list(userId: string): Promise<Booking[]> {
    const result = await this.db.query<Row>(`${BOOKING_SELECT} where b.user_id = $1 order by b.created_at desc limit 200`, [userId]);
    const now = new Date();
    return result.rows.map((row) => this.toBooking(row, now));
  }

  async get(userId: string, id: string): Promise<Booking> {
    const result = await this.db.query<Row>(`${BOOKING_SELECT} where b.id = $1 and b.user_id = $2`, [id, userId]);
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
      .update(JSON.stringify([input.serviceSlug, input.formatSlug, input.mode, input.participant, input.groupSize ?? null, input.recipient?.name ?? null, input.recipient?.phone ?? null, input.addressId, input.startsAt ?? null, input.preferredCoachId ?? null, input.discountCode ? normaliseCode(input.discountCode) : null, input.useCredit ?? false]))
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

        const listPrice = await this.pricing.priceForParticipant(client, service.id, input.mode, input.participant, input.groupSize ?? null);
        if (listPrice === null) throw new DomainError('INTERNAL', 'No price is set for this session.');

        const bookingId = uuidv7();
        // The code is checked and used up inside this same transaction: if the booking fails, the code is not spent.
        if (input.useCredit && input.discountCode) throw new DomainError('INVALID_REQUEST', 'A package credit and a discount code cannot be used together.');
        const creditPurchaseId = input.useCredit ? await this.packages.takeCredit(client, userId, startsAt) : null;
        const discount = input.discountCode ? await this.discounts.quote(client, userId, input.discountCode, listPrice, 'session', true) : null;
        const total = creditPurchaseId ? 0 : discount ? discount.totalPaise : listPrice;
        await client.query(
          `insert into bookings (id, user_id, service_id, format_id, mode, participant, group_size, recipient_name, recipient_phone, address_id, address_label, address_line,
                                 address_area, address_pincode, starts_at, status, preferred_coach_id, total_paise,
                                 idempotency_key, request_fingerprint, discount_code, discount_paise, package_purchase_id)
           values ($1, $2, $3, $4, $5::booking_mode, $16, $17, $18, $19, $6, $7, $8, $9, $10, $11, 'matching', $12, $13, $14, $15, $20, $21, $22)`,
          [bookingId, userId, service.id, format.id, input.mode, address.id, address.label, address.line, address.area,
           address.pincode, startsAt, input.preferredCoachId ?? null, total, input.idempotencyKey, fingerprint, input.participant, input.groupSize ?? null, input.recipient?.name ?? null, input.recipient?.phone ?? null,
           discount?.code ?? null, discount?.discountPaise ?? 0, creditPurchaseId],
        );
        await this.referral.markBooked(client, userId);
        if (discount) await this.discounts.redeem(client, userId, discount, bookingId);
        await this.record(client, bookingId, 'created', 'customer', { mode: input.mode, participant: input.participant, startsAt: startsAt?.toISOString() ?? null, discountCode: discount?.code ?? null, discountPaise: discount?.discountPaise ?? 0 });
        await this.publish(client, bookingId, 'booking.created', {
          bookingId, userId, serviceSlug: service.slug, mode: input.mode, startsAt: startsAt?.toISOString() ?? null, totalPaise: total,
        });
        await notifyCustomer(
          client, userId, 'Booking received',
          `We are finding a coach for your ${service.name} session${startsAt ? ` on ${formatWhen(startsAt)}` : ''}. We will tell you as soon as one accepts.`,
          bookingId,
        );
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
        // An instant session has no time to move, except after we failed to find a coach: then the customer may turn it into a
        // scheduled session on a date they choose, at the price they already agreed.
        const toScheduled = row.mode === 'instant' && row.unfilled_notified_at !== null && (row.status === 'matching' || row.status === 'rematching');
        if ((row.mode === 'instant' && !toScheduled) || !canChange(row.status, row.starts_at, new Date())) {
          throw new DomainError('CHANGE_WINDOW_CLOSED', 'This session can no longer be changed.');
        }
        const startsAt = this.assertBookableSlot(startsAtInput);
        // A package covers the session only up to its end date.
        if (row.package_purchase_id) await this.packages.assertCovers(client, row.package_purchase_id, startsAt);
        // A trainer already on this session may be busy at the new time: then the session goes back to "finding a coach".
        const clash = row.status === 'confirmed' && row.coach_id
          ? (await client.query<{ busy: boolean }>(`select ${trainerBusySql('$1::uuid', '$2', '$4', '$3::uuid')} as busy`, [row.coach_id, startsAt, id, row.duration_max_minutes])).rows[0]?.busy
          : null;
        if (toScheduled) {
          // A fresh start for dispatch: trainers are offered the session again, for its new time, nearest first.
          await client.query(`delete from job_alerts where booking_id = $1`, [id]);
          await client.query(`update bookings set mode = 'scheduled', starts_at = $2, overdue_notified_at = null, unfilled_notified_at = null, dispatch_started_at = now(), dispatch_wave = 0 where id = $1`, [id, startsAt]);
        } else if (clash) await client.query(`update bookings set starts_at = $2, status = 'rematching', coach_id = null, overdue_notified_at = null where id = $1`, [id, startsAt]);
        else await client.query(`update bookings set starts_at = $2, overdue_notified_at = null where id = $1`, [id, startsAt]);
        await this.record(client, id, 'rescheduled', 'customer', { from: row.starts_at?.toISOString() ?? null, to: startsAt.toISOString(), coachFreed: Boolean(clash), fromInstant: toScheduled });
        await this.publish(client, id, 'booking.rescheduled', { bookingId: id, userId, to: startsAt.toISOString() });
        // The trainer already on this session must know: a new time they can keep, or (if they are busy then) that it is no longer theirs.
        if (row.status === 'confirmed' && row.coach_id) {
          await queueTrainerAlert(client, clash ? 'trainer.job_cancelled' : 'trainer.job_moved', id, row.coach_id, {
            sessionCode: sessionCodeOf(id), serviceName: row.service_name, when: formatWhen(startsAt), area: row.address_area ?? '', reason: clash ? 'moved' : 'customer',
          });
        }
        await notifyCustomer(client, userId, 'Session rescheduled', `Your ${row.service_name} session is now ${formatWhen(startsAt)}.${clash ? ' Your coach is not free then, so we are finding another coach and will tell you as soon as one is assigned.' : ''}`, id);
      });
    } catch (error) {
      if (isUnique(error, 'bookings_no_double_booking')) throw new DomainError('SLOT_CONFLICT', 'You already have a session at that time.');
      throw error;
    }
    return this.get(userId, id);
  }

  // The customer rates the trainer once the session is closed (1 to 5 stars, optional short comment). One rating per session.
  async rate(userId: string, id: string, stars: number, comment: string | null): Promise<Booking> {
    await this.db.tx(async (client) => {
      const row = await this.lock(client, userId, id);
      if (row.status !== 'completed' || !row.coach_id) throw new DomainError('INVALID_STATE', 'You can rate a session once it is complete.');
      if (row.rating_stars !== null) throw new DomainError('INVALID_STATE', 'You already rated this session.');
      await client.query(`insert into session_ratings (booking_id, user_id, trainer_id, stars, comment) values ($1, $2, $3, $4, $5)`, [id, userId, row.coach_id, stars, comment]);
      await this.record(client, id, 'rated', 'customer', { stars, trainerId: row.coach_id });
      await this.publish(client, id, 'booking.rated', { bookingId: id, userId, trainerId: row.coach_id, stars });
    });
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
      await this.discounts.releaseForBooking(client, id);
      if (row.package_purchase_id) await this.packages.giveCreditBack(client, row.package_purchase_id);
      await this.record(client, id, 'cancelled', 'customer', {});
      await this.publish(client, id, 'booking.cancelled', { bookingId: id, userId, by: 'customer' });
      // A trainer already on the session is told right away, so they do not travel to a cancelled session.
      if (row.status === 'confirmed' && row.coach_id) {
        await queueTrainerAlert(client, 'trainer.job_cancelled', id, row.coach_id, {
          sessionCode: sessionCodeOf(id), serviceName: row.service_name, when: row.starts_at ? formatWhen(row.starts_at) : 'as soon as possible', area: row.address_area ?? '', reason: 'customer',
        });
      }
      await notifyCustomer(client, userId, 'Booking cancelled', `Your ${row.service_name} session${row.starts_at ? ` on ${formatWhen(row.starts_at)}` : ''} was cancelled.`, id);
    });
    return this.get(userId, id);
  }

  private assertBookableSlot(value: string | undefined): Date {
    return assertBookableSlot(value);
  }

  private async lock(client: PoolClient, userId: string, id: string): Promise<Row> {
    const result = await client.query<Row>(`${BOOKING_SELECT} where b.id = $1 and b.user_id = $2 for update of b`, [id, userId]);
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
