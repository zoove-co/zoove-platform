import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { notifyCustomer } from '../customer/notify';
import { queueTrainerAlert } from '../notifications/trainer-alerts';
import { DatabaseService } from '../database/database.service';
import { PackagesService } from '../packages/packages.service';
import { ALERT_ALL_KEY, alertAllSwitch } from './dispatch.service';
import { assertBookableSlot, sessionCodeOf, type BookingStatus } from './bookings.service';
import { formatWhen } from './rules';
import { trainerBusySql } from './trainer-clash';

export type SessionFilter = 'needs_trainer' | 'upcoming' | 'all';
export type AdminSession = {
  id: string; sessionCode: string; status: BookingStatus; mode: string; participant: string; groupSize: number | null; serviceName: string; formatName: string;
  startsAt: string | null; whenLabel: string; startPassed: boolean; area: string | null; customerName: string; customerContact: string;
  trainerId: string | null; trainerName: string | null; trainerCancelCount: number; trainerCancelledAt: string | null; canMarkNoShow: boolean; totalPaise: number; paidWithCredit: boolean; discountCode: string | null; createdAt: string;
};
export type SessionEvent = { type: string; actor: string; payload: Record<string, unknown>; createdAt: string };
export type AdminSessionDetail = AdminSession & { addressLabel: string; addressLine: string; pincode: string | null; recipient: { name: string; phone: string } | null; events: SessionEvent[] };
export type TrainerOption = { id: string; name: string };
// A trainer who can take this session: not busy at its time and has not dropped it. sameDay = confirmed sessions already that day.
export type AvailableTrainer = { id: string; name: string; sameDay: number; acceptingJobs: boolean };

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
    canMarkNoShow: r.status === 'confirmed' && r.coach_id !== null && (r.starts_at === null || r.starts_at.getTime() <= now.getTime()),
    trainerId: r.coach_id, trainerName: r.trainer_name, trainerCancelCount: r.trainer_cancel_count, trainerCancelledAt: r.trainer_cancelled_at ? r.trainer_cancelled_at.toISOString() : null,
    totalPaise: r.total_paise, paidWithCredit: r.package_purchase_id !== null, discountCode: r.discount_code, createdAt: r.created_at.toISOString(),
  };
}

// Ops view of sessions, and the two things ops do when a trainer drops out: record the cancellation, then assign a new trainer.
// There is no trainer app yet, so ops record a trainer's cancellation for them (the trainer's own endpoint will call the same method).
@Injectable()
export class SessionsAdminService {
  constructor(private readonly db: DatabaseService, private readonly packages: PackagesService) {}

  async getDispatchSettings(): Promise<{ alertAll: boolean }> {
    return { alertAll: await alertAllSwitch(this.db) };
  }

  async setDispatchSettings(adminId: string, alertAll: boolean): Promise<{ alertAll: boolean }> {
    await this.db.tx(async (client) => {
      await client.query(
        `insert into app_settings (key, value, updated_by, updated_at) values ($1, $2::jsonb, $3, now())
         on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
        [ALERT_ALL_KEY, JSON.stringify(alertAll), adminId],
      );
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'settings.dispatch_alert_all', 'app_settings', null, $2)`, [adminId, JSON.stringify({ alertAll })]);
    });
    return { alertAll };
  }

  async summary(): Promise<{ needsTrainer: number; trainerCancelled: number; overdue: number }> {
    const r = (await this.db.query<{ needs: string; cancelled: string; overdue: string }>(
      `select count(*) filter (where status in ('matching', 'rematching')) as needs,
              count(*) filter (where status = 'rematching' and trainer_cancelled_at is not null) as cancelled,
              count(*) filter (where starts_at is not null and starts_at <= now()) as overdue
         from bookings where status in ('matching', 'rematching')`)).rows[0]!;
    return { needsTrainer: Number(r.needs), trainerCancelled: Number(r.cancelled), overdue: Number(r.overdue) };
  }

  async list(filter: SessionFilter, q?: string): Promise<AdminSession[]> {
    const where = filter === 'needs_trainer' ? `b.status in ('matching', 'rematching')` : filter === 'upcoming' ? `b.status = 'confirmed' and (b.starts_at is null or b.starts_at >= now() - interval '3 hours')` : 'true';
    const order = filter === 'needs_trainer' ? `(b.starts_at is not null and b.starts_at <= now()) desc, (b.status = 'rematching') desc, b.starts_at nulls first, b.created_at` : filter === 'upcoming' ? `b.starts_at nulls first` : `b.created_at desc`;
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

  // Trainers who are free for this session: active, not already confirmed on another session at the same start time, and not
  // one who already dropped this session. Instant sessions have no start time, so only the "dropped" rule applies.
  async availableTrainers(id: string): Promise<AvailableTrainer[]> {
    const b = (await this.db.query<{ status: BookingStatus; starts_at: Date | null; minutes: number }>(`select b.status, b.starts_at, s.duration_max_minutes as minutes from bookings b join services s on s.id = b.service_id where b.id = $1`, [id])).rows[0];
    if (!b) throw new DomainError('NOT_FOUND', 'We could not find that session.');
    if (b.status !== 'matching' && b.status !== 'rematching') return [];
    if (b.starts_at && b.starts_at.getTime() <= Date.now()) return [];
    const r = await this.db.query<{ user_id: string; name: string; same_day: string; accepting_jobs: boolean }>(
      `select t.user_id, coalesce(nullif(trim(concat_ws(' ', ta.first_name, ta.last_name)), ''), u.full_name, u.email, 'Trainer') as name,
              (select count(*) from bookings x where x.coach_id = t.user_id and x.status = 'confirmed' and $2::timestamptz is not null
                  and (x.starts_at at time zone 'Asia/Kolkata')::date = ($2::timestamptz at time zone 'Asia/Kolkata')::date) as same_day, t.accepting_jobs
         from trainers t join trainer_applications ta on ta.id = t.application_id join users u on u.id = t.user_id
        where t.status = 'active'
          and not exists (select 1 from booking_events e where e.booking_id = $1 and e.type in ('trainer_cancelled', 'trainer_no_show') and e.payload->>'trainerId' = t.user_id::text)
          and ($2::timestamptz is null or not ${trainerBusySql('t.user_id', '$2', '$3', '$1')})
        order by name`,
      [id, b.starts_at, b.minutes],
    );
    return r.rows.map((row) => ({ id: row.user_id, name: row.name, sameDay: Number(row.same_day), acceptingJobs: row.accepting_jobs }));
  }

  private async lock(client: PoolClient, id: string) {
    const r = await client.query<{ id: string; user_id: string; status: BookingStatus; mode: string; starts_at: Date | null; coach_id: string | null; service_name: string; package_purchase_id: string | null; address_area: string | null; minutes: number }>(
      `select b.id, b.user_id, b.status, b.mode, b.starts_at, b.coach_id, b.package_purchase_id, b.address_area, s.name as service_name, s.duration_max_minutes as minutes from bookings b join services s on s.id = b.service_id where b.id = $1 for update of b`, [id]);
    const row = r.rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'We could not find that session.');
    return row;
  }

  // A trainer cannot make a confirmed session. It goes back to "finding a trainer", the customer and ops are told (with the
  // session code), and the customer keeps the discount or package credit they used because they did nothing wrong.
  // `onlyCoachId` is set when a trainer cancels for themselves: it must still be their session when the row is locked.
  async trainerCancel(actorUserId: string, actor: 'admin' | 'trainer', id: string, reason: string, onlyCoachId?: string): Promise<AdminSessionDetail> {
    await this.db.tx(async (client) => {
      const row = await this.lock(client, id);
      if (row.status !== 'confirmed' || !row.coach_id) throw new DomainError('INVALID_STATE', 'Only a session that has a trainer can be cancelled by its trainer.');
      if (onlyCoachId && row.coach_id !== onlyCoachId) throw new DomainError('INVALID_STATE', 'This session is no longer yours.');
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

  // The trainer was assigned but did not arrive. Ops record it after the start time: the session goes back to "finding a
  // trainer" with no trainer on it, the trainer is marked against the session, and the customer is told what they can do.
  // The customer keeps their package credit or discount (it is returned if they cancel). Nothing is cancelled for them.
  async trainerNoShow(adminId: string, id: string, note: string): Promise<AdminSessionDetail> {
    await this.db.tx(async (client) => {
      const row = await this.lock(client, id);
      if (row.status !== 'confirmed' || !row.coach_id) throw new DomainError('INVALID_STATE', 'Only a session with a trainer on it can be marked as a no-show.');
      if (row.starts_at && row.starts_at.getTime() > Date.now()) throw new DomainError('INVALID_STATE', 'This session has not started yet. If the trainer cannot come, record a trainer cancellation instead.');
      const code = sessionCodeOf(id);
      await client.query(`update bookings set status = 'rematching', coach_id = null, trainer_cancelled_at = now(), overdue_notified_at = now() where id = $1`, [id]);
      await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'trainer_no_show', 'admin', $3)`, [uuidv7(), id, JSON.stringify({ note, trainerId: row.coach_id, byUserId: adminId })]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'session.trainer_no_show', 'booking', $2, $3)`, [adminId, id, JSON.stringify({ note, trainerId: row.coach_id })]);
      const options = row.mode === 'instant' ? 'You can wait while we find another coach, or cancel.' : 'You can move the session to another time, or cancel. Any package credit or discount code is returned if you cancel.';
      await notifyCustomer(
        client, row.user_id, 'Your coach did not arrive',
        `We are very sorry. Your coach did not arrive for your ${row.service_name} session${row.starts_at ? ` on ${formatWhen(row.starts_at)}` : ''} (session ${code}). ${options}`,
        id,
      );
    });
    return this.detail(id);
  }

  // Ops can move any live session to another time for the customer, in every case (also after the start time has passed, and
  // inside the 2-hour window the customer is held to). A trainer who is already on it stays on it unless they are busy then,
  // and is told the new time by email. The customer is always told.
  async reschedule(adminId: string, id: string, startsAtInput: string, reason: string): Promise<AdminSessionDetail> {
    try {
      await this.db.tx(async (client) => {
        const row = await this.lock(client, id);
        if (row.status === 'completed' || row.status === 'cancelled') throw new DomainError('INVALID_STATE', 'This session is finished, so it cannot be moved.');
        if (row.mode === 'instant') throw new DomainError('INVALID_STATE', 'An instant session has no set time. Cancel it and ask the customer to book a scheduled session.');
        const startsAt = assertBookableSlot(startsAtInput);
        if (row.package_purchase_id) await this.packages.assertCovers(client, row.package_purchase_id, startsAt);
        const clash = row.status === 'confirmed' && row.coach_id
          ? (await client.query<{ busy: boolean }>(`select ${trainerBusySql('$1::uuid', '$2', '$4', '$3::uuid')} as busy`, [row.coach_id, startsAt, id, row.minutes])).rows[0]?.busy
          : null;
        if (clash) await client.query(`update bookings set starts_at = $2, status = 'rematching', coach_id = null, overdue_notified_at = null where id = $1`, [id, startsAt]);
        else await client.query(`update bookings set starts_at = $2, overdue_notified_at = null where id = $1`, [id, startsAt]);
        await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'rescheduled', 'admin', $3)`, [
          uuidv7(), id, JSON.stringify({ from: row.starts_at?.toISOString() ?? null, to: startsAt.toISOString(), reason, byUserId: adminId, coachFreed: Boolean(clash) }),
        ]);
        await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'booking.rescheduled', $3)`, [uuidv7(), id, JSON.stringify({ bookingId: id, userId: row.user_id, to: startsAt.toISOString(), by: 'admin' })]);
        await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'session.rescheduled_by_admin', 'booking', $2, $3)`, [adminId, id, JSON.stringify({ to: startsAt.toISOString(), reason })]);
        // A trainer who stays on the session is told the new time by email.
        if (row.status === 'confirmed' && row.coach_id && !clash) {
          await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'trainer.job_moved', $3)`, [
            uuidv7(), id, JSON.stringify({ trainerId: row.coach_id, sessionCode: sessionCodeOf(id), serviceName: row.service_name, when: formatWhen(startsAt), area: row.address_area ?? '' }),
          ]);
        }
        // A trainer who is busy at the new time is taken off the session and told.
        if (row.status === 'confirmed' && row.coach_id && clash) {
          await queueTrainerAlert(client, 'trainer.job_cancelled', id, row.coach_id, { sessionCode: sessionCodeOf(id), serviceName: row.service_name, when: formatWhen(startsAt), area: row.address_area ?? '', reason: 'moved' });
        }
        await notifyCustomer(
          client, row.user_id, 'Your session was moved',
          `Our team moved your ${row.service_name} session (session ${sessionCodeOf(id)}) to ${formatWhen(startsAt)}.${clash ? ' Your coach is not free then, so we are finding another coach and will tell you as soon as one is assigned.' : ''} You can still move it again or cancel it from the app.`,
          id,
        );
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505' && (error as { constraint?: string }).constraint === 'bookings_no_double_booking') {
        throw new DomainError('SLOT_CONFLICT', 'The customer already has another session at that time.');
      }
      throw error;
    }
    return this.detail(id);
  }

  // The session happened. The trainer closes it from their jobs page, or ops close it from here. Closing is what makes the
  // customer's streak, ratings and the trainer's payout possible, and it tells CleverTap the session was completed.
  // An instant session has no start time until now, so it gets one: the moment it was closed.
  // `onlyCoachId` is set when a trainer closes their own session: it must still be theirs when the row is locked.
  async complete(actorUserId: string, actor: 'admin' | 'trainer', id: string, onlyCoachId?: string): Promise<AdminSessionDetail> {
    await this.db.tx(async (client) => {
      const row = await this.lock(client, id);
      if (row.status === 'completed') return; // closing twice changes nothing
      if (row.status !== 'confirmed' || !row.coach_id) throw new DomainError('INVALID_STATE', 'Only a session that has a trainer on it can be marked as done.');
      if (onlyCoachId && row.coach_id !== onlyCoachId) throw new DomainError('INVALID_STATE', 'This session is not yours.');
      if (row.starts_at && row.starts_at.getTime() > Date.now()) throw new DomainError('INVALID_STATE', 'This session has not started yet.');
      await client.query(`update bookings set status = 'completed', completed_at = now(), completed_by = $2, starts_at = coalesce(starts_at, now()) where id = $1`, [id, actorUserId]);
      await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'completed', $3, $4)`, [uuidv7(), id, actor, JSON.stringify({ trainerId: row.coach_id, byUserId: actorUserId })]);
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'booking.completed', $3)`, [
        uuidv7(), id, JSON.stringify({ bookingId: id, userId: row.user_id, trainerId: row.coach_id, by: actor }),
      ]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'session.completed', 'booking', $2, $3)`, [actorUserId, id, JSON.stringify({ by: actor, trainerId: row.coach_id })]);
      await notifyCustomer(client, row.user_id, 'Session complete', `Your ${row.service_name} session (session ${sessionCodeOf(id)}) is complete. Well done! It counts towards your streak.`, id);
    });
    return this.detail(id);
  }

  async assign(adminId: string, id: string, trainerId: string): Promise<AdminSessionDetail> {
    await this.db.tx(async (client) => {
      const row = await this.lock(client, id);
      if (row.status !== 'matching' && row.status !== 'rematching') throw new DomainError('INVALID_STATE', 'This session already has a trainer or is finished.');
      if (row.starts_at && row.starts_at.getTime() <= Date.now()) throw new DomainError('INVALID_STATE', 'This session\'s start time has passed. Move it to a new time first (Move to another time), then assign a trainer.');
      const trainer = (await client.query<{ name: string }>(
        `select coalesce(nullif(trim(concat_ws(' ', ta.first_name, ta.last_name)), ''), u.full_name, 'Your coach') as name
           from trainers t join trainer_applications ta on ta.id = t.application_id join users u on u.id = t.user_id where t.user_id = $1 and t.status = 'active'`, [trainerId])).rows[0];
      if (!trainer) throw new DomainError('INVALID_REQUEST', 'That trainer is not active.');
      // One trainer cannot be put on two sessions at the same time by two people at once: take this trainer's lock first.
      await client.query(`select 1 from trainers where user_id = $1 for update`, [trainerId]);
      const cancelledBefore = await client.query(`select 1 from booking_events where booking_id = $1 and type in ('trainer_cancelled', 'trainer_no_show') and payload->>'trainerId' = $2 limit 1`, [id, trainerId]);
      if (cancelledBefore.rows[0]) throw new DomainError('INVALID_REQUEST', 'This trainer already dropped this session. Choose another trainer.');
      if (row.starts_at) {
        const clash = await client.query<{ busy: boolean }>(`select ${trainerBusySql('$1::uuid', '$2', '$4', '$3::uuid')} as busy`, [trainerId, row.starts_at, id, row.minutes]);
        if (clash.rows[0]?.busy) throw new DomainError('SLOT_CONFLICT', 'That trainer already has a session that overlaps this time.');
      }
      await client.query(`update bookings set status = 'confirmed', coach_id = $2 where id = $1`, [id, trainerId]);
      await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'trainer_assigned', 'admin', $3)`, [uuidv7(), id, JSON.stringify({ trainerId, byUserId: adminId })]);
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'booking.trainer_assigned', $3)`, [uuidv7(), id, JSON.stringify({ bookingId: id, userId: row.user_id, trainerId })]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'session.trainer_assigned', 'booking', $2, $3)`, [adminId, id, JSON.stringify({ trainerId })]);
      await notifyCustomer(client, row.user_id, 'Coach assigned', `Coach ${trainer.name.split(' ')[0]} will take your ${row.service_name} session${row.starts_at ? ` on ${formatWhen(row.starts_at)}` : ''} (session ${sessionCodeOf(id)}).`, id);
      // The trainer is told by email (outbox worker, retried). They can cancel from the Jobs page if they cannot make it.
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'trainer.job_assigned', $3)`, [
        uuidv7(), id, JSON.stringify({ trainerId, sessionCode: sessionCodeOf(id), serviceName: row.service_name, when: row.starts_at ? formatWhen(row.starts_at) : 'as soon as possible', area: row.address_area ?? '' }),
      ]);
    });
    return this.detail(id);
  }
}
