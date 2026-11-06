import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import { sessionCodeOf } from './bookings.service';
import { CHECK_IN_EARLY_MINUTES, formatWhen } from './rules';
import { SessionsAdminService } from './sessions-admin.service';
import { trainerBusySql } from './trainer-clash';

export type OpenJob = {
  id: string; sessionCode: string; serviceName: string; formatName: string; startsAt: string | null; whenLabel: string;
  participant: string; groupSize: number | null; area: string | null;
  // How close the job is to this trainer's own pincode: same pincode, same area group, or elsewhere in the city. Null where it does not apply.
  nearness: 'same_pincode' | 'near_you' | 'elsewhere' | null;
};
// A job the trainer already holds. The full address and the customer's first name are shown only here, never on an open job.
export type MyJob = OpenJob & { customerFirstName: string; addressLabel: string; addressLine: string; pincode: string | null; canCancel: boolean; canCheckIn: boolean; started: boolean; startedAt: string | null; endsAt: string | null; timeUp: boolean; note: string };
// A session this trainer finished, newest first (the last 30).
export type DoneJob = OpenJob & { customerFirstName: string; completedAt: string | null; note: string };
export type JobBoard = { acceptingJobs: boolean; open: OpenJob[]; mine: MyJob[]; done: DoneJob[]; doneCount: number };

type Row = {
  id: string; mode: string; participant: string; group_size: number | null; starts_at: Date | null; address_area: string | null; address_pincode: string | null;
  address_label: string; address_line: string; service_name: string; format_name: string; full_name: string | null; note?: string | null; completed_at?: Date | null; started_at?: Date | null; ends_at?: Date | null; cluster_name: string | null; near?: 'same_pincode' | 'near_you' | 'elsewhere' | null;
};
const COLS = `b.id, b.mode, b.participant, b.group_size, b.starts_at, b.address_area, b.address_pincode, b.address_label, b.address_line, s.name as service_name, f.name as format_name, u.full_name,
  (select c.name from cluster_pincodes cp join clusters c on c.id = cp.cluster_id where cp.pincode = b.address_pincode limit 1) as cluster_name`;
const FROM = `from bookings b join services s on s.id = b.service_id join service_formats f on f.id = b.format_id join users u on u.id = b.user_id`;

// The area the customer typed, unless it is only the city name (then the real area name of their pincode is more useful).
const areaLabel = (r: Row): string | null => (r.address_area && r.address_area.trim().toLowerCase() !== 'mumbai' ? r.address_area : (r.cluster_name ?? r.address_area));

const toOpen = (r: Row): OpenJob => ({
  id: r.id, sessionCode: sessionCodeOf(r.id), serviceName: r.service_name, formatName: r.format_name, startsAt: r.starts_at ? r.starts_at.toISOString() : null,
  whenLabel: r.starts_at ? formatWhen(r.starts_at) : 'As soon as possible', participant: r.participant, groupSize: r.group_size, area: areaLabel(r), nearness: r.near ?? null,
});

// What a trainer sees and does: the open jobs nobody has taken (first to accept gets it), their own sessions, and cancelling one of theirs.
// Ops can still assign any session directly from the admin panel.
@Injectable()
export class TrainerJobsService {
  constructor(private readonly db: DatabaseService, private readonly sessions: SessionsAdminService) {}

  private async assertActiveTrainer(userId: string): Promise<void> {
    const t = await this.db.query(`select 1 from trainers where user_id = $1 and status = 'active'`, [userId]);
    if (!t.rows[0]) throw new DomainError('FORBIDDEN', 'Jobs are for active Zoove trainers.');
  }

  async board(userId: string): Promise<JobBoard> {
    await this.assertActiveTrainer(userId);
    const now = new Date();
    const accepting = (await this.db.query<{ accepting_jobs: boolean }>(`select accepting_jobs from trainers where user_id = $1`, [userId])).rows[0]?.accepting_jobs ?? true;
    const [open, mine, done, doneCount] = await Promise.all([
      // Open = no trainer yet, not started, this trainer has not dropped it, and this trainer is not busy at that time.
      this.db.query<Row>(
        `select ${COLS},
                case when b.address_pincode is not null and b.address_pincode = me.pin then 'same_pincode'
                     when exists (select 1 from cluster_pincodes a join cluster_pincodes c on c.cluster_id = a.cluster_id where a.pincode = b.address_pincode and c.pincode = me.pin) then 'near_you'
                     else 'elsewhere' end as near
           ${FROM}
           cross join (select (select ta.address_pincode from trainers t join trainer_applications ta on ta.id = t.application_id where t.user_id = $1::uuid) as pin) me
          where b.status in ('matching', 'rematching') and (b.starts_at is null or b.starts_at > now())
            and exists (select 1 from job_alerts a where a.booking_id = b.id and a.trainer_id = $1::uuid)
            and not exists (select 1 from booking_events e where e.booking_id = b.id and e.type in ('trainer_cancelled', 'trainer_no_show') and e.payload->>'trainerId' = ($1::uuid)::text)
            and (b.starts_at is null or not ${trainerBusySql('$1::uuid', 'b.starts_at', 's.duration_max_minutes')})
          order by b.starts_at nulls first, b.created_at limit 100`, [userId]),
      this.db.query<Row>(
        `select ${COLS}, b.started_at, b.ends_at, n.note ${FROM} left join trainer_session_notes n on n.booking_id = b.id and n.trainer_id = $1::uuid
          where b.coach_id = $1::uuid and b.status = 'confirmed' and (b.starts_at is null or b.starts_at >= now() - interval '7 days')
          order by b.starts_at nulls first, b.created_at limit 100`, [userId]),
      this.db.query<Row>(
        `select ${COLS}, n.note, b.completed_at ${FROM} left join trainer_session_notes n on n.booking_id = b.id and n.trainer_id = $1::uuid
          where b.coach_id = $1::uuid and b.status = 'completed'
          order by b.completed_at desc nulls last, b.starts_at desc nulls last limit 30`, [userId]),
      this.db.query<{ n: string }>(`select count(*)::text as n from bookings where coach_id = $1::uuid and status = 'completed'`, [userId]),
    ]);
    return {
      acceptingJobs: accepting,
      open: accepting ? open.rows.map(toOpen) : [], // switched off: no open jobs are shown

      mine: mine.rows.map((r) => ({
        ...toOpen(r), customerFirstName: r.full_name?.trim().split(/\s+/)[0] || 'Customer', addressLabel: r.address_label, addressLine: r.address_line, pincode: r.address_pincode,
        canCancel: !r.started_at && (r.starts_at === null || r.starts_at.getTime() > now.getTime()),
        canCheckIn: !r.started_at && (r.starts_at === null || r.starts_at.getTime() - now.getTime() <= CHECK_IN_EARLY_MINUTES * 60_000),
        started: r.started_at != null, startedAt: r.started_at ? r.started_at.toISOString() : null, endsAt: r.ends_at ? r.ends_at.toISOString() : null, timeUp: r.started_at != null && (r.ends_at == null || r.ends_at.getTime() <= now.getTime()), note: r.note ?? '',
      })),
      done: done.rows.map((r) => ({ ...toOpen(r), customerFirstName: r.full_name?.trim().split(/\s+/)[0] || 'Customer', completedAt: r.completed_at ? r.completed_at.toISOString() : null, note: r.note ?? '' })),
      doneCount: Number(doneCount.rows[0]?.n ?? 0),
    };
  }

  // First to accept wins: the session row is locked, so two trainers cannot both get it. The trainer's own row is locked too,
  // so they cannot accept two jobs at the same time at once.
  async accept(userId: string, id: string): Promise<JobBoard> {
    await this.assertActiveTrainer(userId);
    if (!(await this.db.query(`select 1 from trainers where user_id = $1 and accepting_jobs`, [userId])).rows[0]) {
      throw new DomainError('INVALID_STATE', 'You are switched off for new jobs. Switch on to take this job.');
    }
    await this.db.tx(async (client) => {
      const row = (await client.query<{ id: string; user_id: string; status: string; starts_at: Date | null; service_name: string; minutes: number }>(
        `select b.id, b.user_id, b.status, b.starts_at, s.name as service_name, s.duration_max_minutes as minutes from bookings b join services s on s.id = b.service_id where b.id = $1 for update of b`, [id])).rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 'We could not find that job.');
      if (row.status !== 'matching' && row.status !== 'rematching') throw new DomainError('INVALID_STATE', 'Someone else just took this job.');
      if (row.starts_at && row.starts_at.getTime() <= Date.now()) throw new DomainError('INVALID_STATE', 'This job\'s start time has passed.');
      // Only a job that was offered to this trainer can be taken (it is offered nearest first, then wider).
      if (!(await client.query(`select 1 from job_alerts where booking_id = $1 and trainer_id = $2`, [id, userId])).rows[0]) {
        throw new DomainError('INVALID_STATE', 'This job is not available to you.');
      }
      const me = (await client.query<{ name: string }>(
        `select coalesce(nullif(trim(concat_ws(' ', ta.first_name, ta.last_name)), ''), u.full_name, 'Your coach') as name
           from trainers t join trainer_applications ta on ta.id = t.application_id join users u on u.id = t.user_id where t.user_id = $1 and t.status = 'active' for update of t`, [userId])).rows[0];
      if (!me) throw new DomainError('FORBIDDEN', 'Jobs are for active Zoove trainers.');
      if ((await client.query(`select 1 from booking_events where booking_id = $1 and type in ('trainer_cancelled', 'trainer_no_show') and payload->>'trainerId' = $2 limit 1`, [id, userId])).rows[0]) {
        throw new DomainError('INVALID_STATE', 'You already dropped this session.');
      }
      if (row.starts_at && (await client.query(`select ${trainerBusySql('$1::uuid', '$2', '$4', '$3::uuid')} as busy`, [userId, row.starts_at, id, row.minutes])).rows[0]?.busy) {
        throw new DomainError('SLOT_CONFLICT', 'You already have a session that overlaps this time.');
      }
      await client.query(`update bookings set status = 'confirmed', coach_id = $2 where id = $1`, [id, userId]);
      await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'trainer_assigned', 'trainer', $3)`, [uuidv7(), id, JSON.stringify({ trainerId: userId, byUserId: userId, pickedByTrainer: true })]);
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'booking.trainer_assigned', $3)`, [uuidv7(), id, JSON.stringify({ bookingId: id, userId: row.user_id, trainerId: userId })]);
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'session.trainer_picked', 'booking', $2, $3)`, [userId, id, JSON.stringify({ trainerId: userId })]);
      await notifyCustomer(client, row.user_id, 'Coach assigned', `Coach ${me.name.split(' ')[0]} will take your ${row.service_name} session${row.starts_at ? ` on ${formatWhen(row.starts_at)}` : ''} (session ${sessionCodeOf(id)}).`, id);
    });
    return this.board(userId);
  }

  // The trainer cannot make it. Same effect as ops recording it: the session goes back to open, the customer and ops are told,
  // and this trainer cannot pick that session again.
  async cancel(userId: string, id: string, reason: string): Promise<JobBoard> {
    await this.assertActiveTrainer(userId);
    await this.sessions.trainerCancel(userId, 'trainer', id, reason, userId);
    return this.board(userId);
  }

  // Check-in (phase start) or check-out (phase end) with the code the customer shows. Check-out closes the session.
  async enterCode(userId: string, id: string, phase: 'start' | 'end', code: string): Promise<JobBoard> {
    await this.assertActiveTrainer(userId);
    const result = await this.sessions.enterCode(userId, id, phase, code);
    if (result === 'locked') throw new DomainError('OTP_LOCKED', 'Too many wrong codes. Try again in 15 minutes, or ask the customer to contact support.');
    if (result === 'wrong') throw new DomainError('OTP_INVALID', 'That code is not right. Ask the customer to check it in their app.');
    return this.board(userId);
  }

  // A private note on a session this trainer holds or finished. An empty note removes it.
  async saveNote(userId: string, id: string, note: string): Promise<JobBoard> {
    await this.assertActiveTrainer(userId);
    const own = await this.db.query(`select 1 from bookings where id = $1 and coach_id = $2 and status in ('confirmed', 'completed')`, [id, userId]);
    if (!own.rows[0]) throw new DomainError('NOT_FOUND', 'We could not find that session.');
    if (note === '') await this.db.query(`delete from trainer_session_notes where booking_id = $1 and trainer_id = $2`, [id, userId]);
    else await this.db.query(`insert into trainer_session_notes (booking_id, trainer_id, note) values ($1, $2, $3) on conflict (booking_id, trainer_id) do update set note = excluded.note, updated_at = now()`, [id, userId, note]);
    return this.board(userId);
  }

  // The trainer's on/off switch. Off: no new sessions are offered to them. Sessions they already hold stay theirs.
  async setAccepting(userId: string, on: boolean): Promise<JobBoard> {
    await this.assertActiveTrainer(userId);
    await this.db.query(`update trainers set accepting_jobs = $2 where user_id = $1`, [userId, on]);
    return this.board(userId);
  }
}
