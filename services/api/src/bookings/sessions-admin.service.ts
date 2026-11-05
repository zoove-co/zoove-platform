import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import { sessionCodeOf, type BookingStatus } from './bookings.service';
import { formatWhen } from './rules';

export type SessionFilter = 'needs_trainer' | 'upcoming' | 'all';
export type AdminSession = {
  id: string; sessionCode: string; status: BookingStatus; mode: string; participant: string; groupSize: number | null; serviceName: string; formatName: string;
  startsAt: string | null; whenLabel: string; startPassed: boolean; area: string | null; customerName: string; customerContact: string;
  trainerId: string | null; trainerName: string | null; trainerCancelCount: number; trainerCancelledAt: string | null; totalPaise: number; paidWithCredit: boolean; discountCode: string | null; createdAt: string;
};
export type SessionEvent = { type: string; actor: string; payload: Record<string, unknown>; createdAt: string };
export type AdminSessionDetail = AdminSession & { addressLabel: string; addressLine: string; pincode: string | null; recipient: { name: string; phone: string } | null; events: SessionEvent[] };
export type TrainerOption = { id: string; name: string };

type ListRow = {
  id: string; status: BookingStatus; mode: string; participant: string; group_size: number | null; service_name: string; format_name: string; starts_at: Date | null;
  address_area: string | null; customer_name: string | null; email: string | null; phone_e164: string | null; coach_id: string | null; trainer_name: string | null;
  trainer_cancel_count: number; trainer_cancelled_at: Date | null; total_paise: number; package_purchase_id: string | null; discount_code: string | null; created_at: Date;
};

const COLS = `b.id, b.status, b.mode, b.participant, b.group_size, b.starts_at, b.address_area, b.coach_id, b.trainer_cancel_count, b.trainer_cancelled_at, b.total_paise,
              b.package_purchase_id, b.discount_code, b.created_at, s.name as service_name, f.name as format_name, u.full_name as customer_name, u.email, u.phone_e164,
              coalesce(c.full_name, (select trim(concat_ws(' ', ta.first_name, ta.last_name)) from trainers t join trainer_applications ta on ta.id = t.application_id where t.user_id = b.coach_id)) as trainer_name`;
const FROM = `from bookings b join services s on s.id = b.service_id join service_formats f on f.id = b.format_id join users u on u.id = b.user_id left join users c on c.id = b.coach_id`;

function toSession(r: ListRow, now = new Date()): AdminSession {
  return {
    id: r.id, sessionCode: sessionCodeOf(r.id), status: r.status, mode: r.mode, participant: r.participant, groupSize: r.group_size, serviceName: r.service_name, formatName: r.format_name,
    startsAt: r.starts_at ? r.starts_at.toISOString() : null, whenLabel: r.starts_at ? formatWhen(r.starts_at) : r.mode === 'instant' ? 'As soon as possible' : 'To be scheduled',
    startPassed: r.starts_at !== null && r.starts_at.getTime() < now.getTime() && (r.status === 'matching' || r.status === 'rematching'),
    area: r.address_area, customerName: r.customer_name ?? 'Customer', customerContact: r.email ?? r.phone_e164 ?? '',
    trainerId: r.coach_id, trainerName: r.trainer_name, trainerCancelCount: r.trainer_cancel_count, trainerCancelledAt: r.trainer_cancelled_at ? r.trainer_cancelled_at.toISOString() : null,
    totalPaise: r.total_paise, paidWithCredit: r.package_purchase_id !== null, discountCode: r.discount_code, createdAt: r.created_at.toISOString(),
  };
}

// Ops view of sessions, and the two things ops do when a trainer drops out: record the cancellation, then assign a new trainer.
// There is no trainer app yet, so ops record a trainer's cancellation for them (the trainer's own endpoint will call the same method).
@Injectable()
export class SessionsAdminService {
  constructor(private readonly db: DatabaseService) {}

  async summary(): Promise<{ needsTrainer: number; trainerCancelled: number }> {
    const r = (await this.db.query<{ needs: string; cancelled: string }>(
      `select count(*) filter (where status in ('matching', 'rematching')) as needs, count(*) filter (where status = 'rematching' and trainer_cancelled_at is not null) as cancelled from bookings where status in ('matching', 'rematching')`)).rows[0]!;
    return { needsTrainer: Number(r.needs), trainerCancelled: Number(r.cancelled) };
  }

  async list(filter: SessionFilter, q?: string): Promise<AdminSession[]> {
    const where = filter === 'needs_trainer' ? `b.status in ('matching', 'rematching')` : filter === 'upcoming' ? `b.status = 'confirmed' and (b.starts_at is null or b.starts_at >= now() - interval '3 hours')` : 'true';
    const order = filter === 'needs_trainer' ? `(b.status = 'rematching') desc, b.starts_at nulls first, b.created_at` : filter === 'upcoming' ? `b.starts_at nulls first` : `b.created_at desc`;
    const term = q?.trim().replace(/^zv-/i, '') ?? '';
    const r = await this.db.query<ListRow>(
      `select ${COLS} ${FROM} where ${where} and ($1 = '' or upper(right(replace(b.id::text, '-', ''), 8)) = upper($1) or u.email ilike $2 or u.full_name ilike $2)
        order by ${order} limit 300`,
      [term, `%${term.replace(/[%_]/g, '')}%`],
    );
    const now = new Date();
    return r.rows.map((row) => toSession(row, now));
  }

  async detail(id: string): Promise<AdminSessionDetail> {
    const r = await this.db.query<ListRow & { address_label: string; address_line: string; address_pincode: string | null; recipient_name: string | null; recipient_phone: string | null }>(
      `select ${COLS}, b.address_label, b.address_line, b.address_pincode, b.recipient_name, b.recipient_phone ${FROM} where b.id = $1`, [id]);
    const row = r.rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'We could not find that session.');
    const events = await this.db.query<{ type: string; actor: string; payload: Record<string, unknown>; created_at: Date }>(
      `select type, actor, payload, created_at from booking_events where booking_id = $1 order by created_at, id`, [id]);
    return {
      ...toSession(row), addressLabel: row.address_label, addressLine: row.address_line, pincode: row.address_pincode,
      recipient: row.recipient_name && row.recipient_phone ? { name: row.recipient_name, phone: row.recipient_phone } : null,
      events: events.rows.map((e) => ({ type: e.type, actor: e.actor, payload: e.payload, createdAt: e.created_at.toISOString() })),
    };
  }

  async trainers(): Promise<TrainerOption[]> {
    const r = await this.db.query<{ user_id: string; name: string }>(
      `select t.user_id, coalesce(nullif(trim(concat_ws(' ', ta.first_name, ta.last_name)), ''), u.full_name, u.email, 'Trainer') as name
         from trainers t join trainer_applications ta on ta.id = t.application_id join users u on u.id = t.user_id where t.status = 'active' order by name`);
    return r.rows.map((row) => ({ id: row.user_id, name: row.name }));
  }

  private async lock(client: PoolClient, id: string) {
    const r = await client.query<{ id: string; user_id: string; status: BookingStatus; mode: string; starts_at: Date | null; coach_id: string | null; service_name: string }>(
      `select b.id, b.user_id, b.status, b.mode, b.starts_at, b.coach_id, s.name as service_name from bookings b join services s on s.id = b.service_id where b.id = $1 for update of b`, [id]);
    const row = r.rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'We could not find that session.');
    return row;
  }

  // A trainer cannot make a confirmed session. It goes back to "finding a trainer", the customer and ops are told (with the
  // session code), and the customer keeps the discount or package credit they used because they did nothing wrong.
  async trainerCancel(actorUserId: string, actor: 'admin' | 'trainer', id: string, reason: string): Promise<AdminSessionDetail> {
    await this.db.tx(async (client) => {
      const row = await this.lock(client, id);
      if (row.status !== 'confirmed' || !row.coach_id) throw new DomainError('INVALID_STATE', 'Only a session that has a trainer can be cancelled by its trainer.');
      if (row.starts_at && row.starts_at.getTime() <= Date.now()) throw new DomainError('INVALID_STATE', 'This session has already started.');
      const code = sessionCodeOf(id);
      await client.query(`update bookings set status = 'rematching', coach_id = null, trainer_cancelled_at = now(), trainer_cancel_count = trainer_cancel_count + 1 where id = $1`, [id]);
      await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'trainer_cancelled', $3, $4)`, [uuidv7(), id, actor, JSON.stringify({ reason, trainerId: row.coach_id, byUserId: actorUserId })]);
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'booking.trainer_cancelled', $3)`, [
        uuidv7(), id, JSON.stringify({ bookingId: id, sessionCode: code, userId: row.user_id, serviceName: row.service_name, when: row.starts_at ? formatWhen(row.starts_at) : 'as soon as possible', reason, trainerId: row.coach_id }),
      ]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'session.trainer_cancelled', 'booking', $2, $3)`, [actorUserId, id, JSON.stringify({ reason, by: actor })]);
      const options = row.mode === 'instant' ? 'You can wait while we find another coach, or cancel.' : 'You can wait while we find another coach, move the session to another time, or cancel.';
      await notifyCustomer(
        client, row.user_id, 'Your coach had to cancel',
        `Your coach can no longer take your ${row.service_name} session${row.starts_at ? ` on ${formatWhen(row.starts_at)}` : ''} (session ${code}). We are finding another coach and will tell you as soon as one is assigned. ${options}`,
        id,
      );
    });
    return this.detail(id);
  }

  async assign(adminId: string, id: string, trainerId: string): Promise<AdminSessionDetail> {
    await this.db.tx(async (client) => {
      const row = await this.lock(client, id);
      if (row.status !== 'matching' && row.status !== 'rematching') throw new DomainError('INVALID_STATE', 'This session already has a trainer or is finished.');
      if (row.starts_at && row.starts_at.getTime() <= Date.now()) throw new DomainError('INVALID_STATE', 'This session\'s start time has passed. Ask the customer to reschedule or cancel.');
      const trainer = (await client.query<{ name: string }>(
        `select coalesce(nullif(trim(concat_ws(' ', ta.first_name, ta.last_name)), ''), u.full_name, 'Your coach') as name
           from trainers t join trainer_applications ta on ta.id = t.application_id join users u on u.id = t.user_id where t.user_id = $1 and t.status = 'active'`, [trainerId])).rows[0];
      if (!trainer) throw new DomainError('INVALID_REQUEST', 'That trainer is not active.');
      const cancelledBefore = await client.query(`select 1 from booking_events where booking_id = $1 and type = 'trainer_cancelled' and payload->>'trainerId' = $2 limit 1`, [id, trainerId]);
      if (cancelledBefore.rows[0]) throw new DomainError('INVALID_REQUEST', 'This trainer already cancelled this session. Choose another trainer.');
      if (row.starts_at) {
        const clash = await client.query(`select 1 from bookings where coach_id = $1 and status = 'confirmed' and starts_at = $2 and id <> $3 limit 1`, [trainerId, row.starts_at, id]);
        if (clash.rows[0]) throw new DomainError('SLOT_CONFLICT', 'That trainer already has a session at this time.');
      }
      await client.query(`update bookings set status = 'confirmed', coach_id = $2 where id = $1`, [id, trainerId]);
      await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'trainer_assigned', 'admin', $3)`, [uuidv7(), id, JSON.stringify({ trainerId, byUserId: adminId })]);
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'booking.trainer_assigned', $3)`, [uuidv7(), id, JSON.stringify({ bookingId: id, userId: row.user_id, trainerId })]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'session.trainer_assigned', 'booking', $2, $3)`, [adminId, id, JSON.stringify({ trainerId })]);
      await notifyCustomer(client, row.user_id, 'Coach assigned', `Coach ${trainer.name.split(' ')[0]} will take your ${row.service_name} session${row.starts_at ? ` on ${formatWhen(row.starts_at)}` : ''} (session ${sessionCodeOf(id)}).`, id);
    });
    return this.detail(id);
  }
}
