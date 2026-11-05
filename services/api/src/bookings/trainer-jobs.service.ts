import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import { sessionCodeOf } from './bookings.service';
import { formatWhen } from './rules';
import { SessionsAdminService } from './sessions-admin.service';

export type OpenJob = {
  id: string; sessionCode: string; serviceName: string; formatName: string; startsAt: string | null; whenLabel: string;
  participant: string; groupSize: number | null; area: string | null;
};
// A job the trainer already holds. The full address and the customer's first name are shown only here, never on an open job.
export type MyJob = OpenJob & { customerFirstName: string; addressLabel: string; addressLine: string; pincode: string | null; canCancel: boolean; canComplete: boolean };
export type JobBoard = { open: OpenJob[]; mine: MyJob[] };

type Row = {
  id: string; mode: string; participant: string; group_size: number | null; starts_at: Date | null; address_area: string | null; address_pincode: string | null;
  address_label: string; address_line: string; service_name: string; format_name: string; full_name: string | null;
};
const COLS = `b.id, b.mode, b.participant, b.group_size, b.starts_at, b.address_area, b.address_pincode, b.address_label, b.address_line, s.name as service_name, f.name as format_name, u.full_name`;
const FROM = `from bookings b join services s on s.id = b.service_id join service_formats f on f.id = b.format_id join users u on u.id = b.user_id`;

const toOpen = (r: Row): OpenJob => ({
  id: r.id, sessionCode: sessionCodeOf(r.id), serviceName: r.service_name, formatName: r.format_name, startsAt: r.starts_at ? r.starts_at.toISOString() : null,
  whenLabel: r.starts_at ? formatWhen(r.starts_at) : 'As soon as possible', participant: r.participant, groupSize: r.group_size, area: r.address_area,
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
    const [open, mine] = await Promise.all([
      // Open = no trainer yet, not started, this trainer has not dropped it, and this trainer is not busy at that time.
      this.db.query<Row>(
        `select ${COLS} ${FROM}
          where b.status in ('matching', 'rematching') and (b.starts_at is null or b.starts_at > now())
            and exists (select 1 from job_alerts a where a.booking_id = b.id and a.trainer_id = $1::uuid)
            and not exists (select 1 from booking_events e where e.booking_id = b.id and e.type in ('trainer_cancelled', 'trainer_no_show') and e.payload->>'trainerId' = ($1::uuid)::text)
            and (b.starts_at is null or not exists (select 1 from bookings x where x.coach_id = $1::uuid and x.status = 'confirmed' and x.starts_at = b.starts_at))
          order by b.starts_at nulls first, b.created_at limit 100`, [userId]),
      this.db.query<Row>(
        `select ${COLS} ${FROM}
          where b.coach_id = $1::uuid and b.status = 'confirmed' and (b.starts_at is null or b.starts_at >= now() - interval '7 days')
          order by b.starts_at nulls first, b.created_at limit 100`, [userId]),
    ]);
    return {
      open: open.rows.map(toOpen),
      mine: mine.rows.map((r) => ({
        ...toOpen(r), customerFirstName: r.full_name?.trim().split(/\s+/)[0] || 'Customer', addressLabel: r.address_label, addressLine: r.address_line, pincode: r.address_pincode,
        canCancel: r.starts_at === null || r.starts_at.getTime() > now.getTime(),
        canComplete: r.starts_at === null || r.starts_at.getTime() <= now.getTime(),
      })),
    };
  }

  // First to accept wins: the session row is locked, so two trainers cannot both get it. The trainer's own row is locked too,
  // so they cannot accept two jobs at the same time at once.
  async accept(userId: string, id: string): Promise<JobBoard> {
    await this.assertActiveTrainer(userId);
    await this.db.tx(async (client) => {
      const row = (await client.query<{ id: string; user_id: string; status: string; starts_at: Date | null; service_name: string }>(
        `select b.id, b.user_id, b.status, b.starts_at, s.name as service_name from bookings b join services s on s.id = b.service_id where b.id = $1 for update of b`, [id])).rows[0];
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
      if (row.starts_at && (await client.query(`select 1 from bookings where coach_id = $1 and status = 'confirmed' and starts_at = $2 and id <> $3 limit 1`, [userId, row.starts_at, id])).rows[0]) {
        throw new DomainError('SLOT_CONFLICT', 'You already have a session at this time.');
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

  // The trainer marks their own session done once it has started.
  async complete(userId: string, id: string): Promise<JobBoard> {
    await this.assertActiveTrainer(userId);
    await this.sessions.complete(userId, 'trainer', id, userId);
    return this.board(userId);
  }
}
