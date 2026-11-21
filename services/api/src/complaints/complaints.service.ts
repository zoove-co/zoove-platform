import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { sessionCodeOf } from '../bookings/bookings.service';
import { DomainError } from '../common/domain-error';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import {
  CATEGORIES, MAX_MESSAGES_PER_HOUR, MAX_NEW_PER_DAY, REOPEN_DAYS, SESSION_LOOKBACK_DAYS, SESSION_PICKER_LIMIT, TEAM_NAME,
  categoryOf, complaintCodeOf, labelOf, type CategoryInfo, type ComplaintPriority, type ComplaintSide, type ComplaintStatus,
} from './complaints.rules';

// ---- what a customer or trainer sees ----
export type SessionRef = { id: string; code: string; serviceName: string; startsAt: string | null; status: string };
export type MessageView = { id: string; from: 'you' | 'team' | 'system'; body: string; createdAt: string };
export type ComplaintSummary = {
  id: string; code: string; category: string; categoryLabel: string; subject: string; status: ComplaintStatus; session: SessionRef | null;
  lastMessage: { from: 'you' | 'team' | 'system'; body: string; at: string } | null; unread: boolean; createdAt: string; resolvedAt: string | null; canReply: boolean;
};
export type ComplaintDetail = ComplaintSummary & { messages: MessageView[]; resolutionNote: string | null };
export type MyComplaints = { active: ComplaintSummary[]; past: ComplaintSummary[]; unread: number };

// ---- what the team sees ----
export type AdminMessage = { id: string; from: 'user' | 'admin' | 'system'; internal: boolean; authorName: string | null; body: string; createdAt: string };
export type AdminComplaintRow = {
  id: string; code: string; side: ComplaintSide; category: string; categoryLabel: string; subject: string; status: ComplaintStatus; urgent: boolean;
  personName: string; personPhone: string | null; sessionCode: string | null; assignedToId: string | null; assignedToName: string | null;
  lastMessage: { from: 'user' | 'admin' | 'system'; body: string } | null; lastMessageAt: string; createdAt: string; resolvedAt: string | null;
};
export type AdminSessionCard = {
  id: string; code: string; serviceName: string; mode: string; status: string; startsAt: string | null; startedAt: string | null; completedAt: string | null; area: string | null;
  customerName: string | null; customerPhone: string | null; trainerName: string | null; trainerPhone: string | null;
};
export type AdminComplaintDetail = AdminComplaintRow & {
  messages: AdminMessage[]; resolutionNote: string | null; resolvedByName: string | null;
  person: { id: string; name: string; phone: string | null; email: string | null; complaintsTotal: number; complaintsOpen: number };
  session: AdminSessionCard | null;
  // Other complaints about the same session, e.g. the trainer's side of a customer's complaint. Only the sides this admin may handle are listed.
  related: { id: string; code: string; side: ComplaintSide; status: ComplaintStatus; subject: string }[];
};
export type AdminAccess = { isOwner: boolean; permissions: string[] };
export type AdminListQuery = { side?: ComplaintSide | undefined; status?: 'active' | ComplaintStatus | 'all' | undefined; q?: string | undefined; mine?: boolean | undefined; limit: number };

const preview = (text: string, n = 110): string => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);
const fromUser = (kind: string): 'you' | 'team' | 'system' => (kind === 'user' ? 'you' : kind === 'admin' ? 'team' : 'system');

// How a person is named in the team's screens: trainers by their application name, customers by their profile.
const PERSON_SQL = `case when c.side = 'trainer'
  then coalesce(nullif(trim(concat_ws(' ', ta.first_name, ta.last_name)), ''), nullif(u.full_name, ''), u.email, u.phone_e164)
  else coalesce(nullif(u.full_name, ''), nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email, u.phone_e164) end`;
const TRAINER_APPLICATION_JOIN = `left join lateral (select first_name, last_name from trainer_applications where user_id = c.user_id and c.side = 'trainer' order by created_at desc limit 1) ta on true`;

type UserRow = {
  id: string; code: string; category: string; subject: string; status: ComplaintStatus; booking_id: string | null; created_at: Date; resolved_at: Date | null; resolution_note: string | null;
  last_message_at: Date; last_admin_reply_at: Date | null; user_read_at: Date; service_name: string | null; b_starts_at: Date | null; b_status: string | null;
  last_from: string | null; last_body: string | null; last_at: Date | null;
};
const USER_SELECT = `select c.id, c.code, c.category, c.subject, c.status, c.booking_id, c.created_at, c.resolved_at, c.resolution_note, c.last_message_at, c.last_admin_reply_at, c.user_read_at,
       s.name as service_name, b.starts_at as b_starts_at, b.status as b_status, lm.sender_kind as last_from, lm.body as last_body, lm.created_at as last_at
  from complaints c
  left join bookings b on b.id = c.booking_id
  left join services s on s.id = b.service_id
  left join lateral (select sender_kind, body, created_at from complaint_messages m where m.complaint_id = c.id and not m.internal order by m.created_at desc limit 1) lm on true`;

const canReplyTo = (status: ComplaintStatus, resolvedAt: Date | null): boolean =>
  status !== 'resolved' || (resolvedAt !== null && Date.now() - resolvedAt.getTime() < REOPEN_DAYS * 86_400_000);

function summarise(r: UserRow): ComplaintSummary {
  return {
    id: r.id, code: r.code, category: r.category, categoryLabel: labelOf(r.category), subject: r.subject, status: r.status,
    session: r.booking_id ? { id: r.booking_id, code: sessionCodeOf(r.booking_id), serviceName: r.service_name ?? 'Session', startsAt: r.b_starts_at?.toISOString() ?? null, status: r.b_status ?? '' } : null,
    lastMessage: r.last_from && r.last_body && r.last_at ? { from: fromUser(r.last_from), body: preview(r.last_body), at: r.last_at.toISOString() } : null,
    unread: r.last_admin_reply_at !== null && r.last_admin_reply_at.getTime() > r.user_read_at.getTime(),
    createdAt: r.created_at.toISOString(), resolvedAt: r.resolved_at?.toISOString() ?? null, canReply: canReplyTo(r.status, r.resolved_at),
  };
}

// A customer or a trainer raises a complaint, and the Zoove team answers it in the same thread until it is resolved. A customer's thread and a
// trainer's thread are always separate. Every change by the team is recorded, and the person is told by push when the team writes.
@Injectable()
export class ComplaintsService {
  constructor(private readonly db: DatabaseService) {}

  // ================= customer and trainer =================

  categories(side: ComplaintSide): CategoryInfo[] { return CATEGORIES[side]; }

  private async assertEligible(userId: string, side: ComplaintSide): Promise<void> {
    if (side === 'trainer') {
      const trainer = await this.db.query(`select 1 from trainers where user_id = $1`, [userId]);
      if (!trainer.rows[0]) throw new DomainError('FORBIDDEN', 'Only Zoove trainers can use this.');
    }
  }

  // The person's recent sessions, for "which session is this about?". Customers see their own; trainers see the ones they were given.
  async sessions(userId: string, side: ComplaintSide): Promise<SessionRef[]> {
    await this.assertEligible(userId, side);
    const who = side === 'customer' ? 'b.user_id' : 'b.coach_id';
    const r = await this.db.query<{ id: string; name: string; starts_at: Date | null; created_at: Date; status: string }>(
      `select b.id, s.name, b.starts_at, b.created_at, b.status from bookings b join services s on s.id = b.service_id
        where ${who} = $1 and coalesce(b.starts_at, b.created_at) > now() - make_interval(days => $2)
        order by coalesce(b.starts_at, b.created_at) desc limit $3`, [userId, SESSION_LOOKBACK_DAYS, SESSION_PICKER_LIMIT]);
    return r.rows.map((b) => ({ id: b.id, code: sessionCodeOf(b.id), serviceName: b.name, startsAt: b.starts_at?.toISOString() ?? null, status: b.status }));
  }

  async mine(userId: string, side: ComplaintSide): Promise<MyComplaints> {
    await this.assertEligible(userId, side);
    const r = await this.db.query<UserRow>(`${USER_SELECT} where c.user_id = $1 and c.side = $2 order by c.last_message_at desc limit 100`, [userId, side]);
    const all = r.rows.map(summarise);
    return { active: all.filter((c) => c.status !== 'resolved'), past: all.filter((c) => c.status === 'resolved').slice(0, 30), unread: all.filter((c) => c.unread).length };
  }

  async unreadCount(userId: string, side: ComplaintSide): Promise<{ unread: number }> {
    const r = await this.db.query<{ n: string }>(`select count(*) as n from complaints where user_id = $1 and side = $2 and last_admin_reply_at > user_read_at`, [userId, side]);
    return { unread: Number(r.rows[0]?.n ?? 0) };
  }

  // Opening a thread marks the team's replies as read.
  async open(userId: string, side: ComplaintSide, id: string): Promise<ComplaintDetail> {
    const found = await this.db.query<UserRow>(`${USER_SELECT} where c.id = $1 and c.user_id = $2 and c.side = $3`, [id, userId, side]);
    const row = found.rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'We could not find that complaint.');
    const messages = await this.db.query<{ id: string; sender_kind: string; body: string; created_at: Date }>(
      `select id, sender_kind, body, created_at from complaint_messages where complaint_id = $1 and not internal order by created_at, id`, [id]);
    const summary = summarise(row);
    await this.db.query(`update complaints set user_read_at = now() where id = $1 and last_admin_reply_at > user_read_at`, [id]);
    return { ...summary, unread: false, resolutionNote: row.resolution_note, messages: messages.rows.map((m) => ({ id: m.id, from: fromUser(m.sender_kind), body: m.body, createdAt: m.created_at.toISOString() })) };
  }

  async create(userId: string, side: ComplaintSide, input: { category: string; bookingId?: string | undefined; message: string; idempotencyKey: string }): Promise<ComplaintDetail> {
    await this.assertEligible(userId, side);
    const category = categoryOf(side, input.category);
    if (!category) throw new DomainError('INVALID_REQUEST', 'Please choose what this is about.');
    if (category.needsSession && !input.bookingId) throw new DomainError('INVALID_REQUEST', 'Please choose the session this is about.');
    const id = await this.db.tx(async (client) => {
      const again = await client.query<{ id: string }>(`select id from complaints where user_id = $1 and idempotency_key = $2`, [userId, input.idempotencyKey]);
      if (again.rows[0]) return again.rows[0].id; // the same request sent twice: one complaint
      let session: { id: string; service_name: string } | undefined;
      if (input.bookingId) {
        const who = side === 'customer' ? 'b.user_id' : 'b.coach_id';
        session = (await client.query<{ id: string; service_name: string }>(
          `select b.id, s.name as service_name from bookings b join services s on s.id = b.service_id
            where b.id = $1 and ${who} = $2 and coalesce(b.starts_at, b.created_at) > now() - make_interval(days => $3)`, [input.bookingId, userId, SESSION_LOOKBACK_DAYS])).rows[0];
        if (!session) throw new DomainError('NOT_FOUND', 'We could not find that session.');
        // One open complaint per session and topic: a second message goes into the thread that is already open.
        const open = await client.query<{ id: string }>(
          `select id from complaints where user_id = $1 and side = $2 and booking_id = $3 and category = $4 and status <> 'resolved' limit 1`, [userId, side, session.id, category.key]);
        if (open.rows[0]) {
          // A retry of the same request (a dropped connection) must not add the same message twice.
          const dup = await client.query(`select 1 from complaint_messages where complaint_id = $1 and sender_kind = 'user' and body = $2 and created_at > now() - interval '2 minutes' limit 1`, [open.rows[0].id, input.message]);
          if (!dup.rows[0]) await this.addUserMessage(client, userId, side, open.rows[0].id, input.message);
          return open.rows[0].id;
        }
      }
      const today = await client.query<{ n: string }>(`select count(*) as n from complaints where user_id = $1 and created_at > now() - interval '1 day'`, [userId]);
      if (Number(today.rows[0]?.n ?? 0) >= MAX_NEW_PER_DAY) throw new DomainError('TOO_MANY_REQUESTS', 'You have sent a few complaints today. Please add to one of them, and we will reply there.');
      const complaintId = uuidv7();
      const code = complaintCodeOf(complaintId);
      const subject = session ? `${category.label} · ${sessionCodeOf(session.id)}` : category.label;
      // Two identical requests at the same moment: one wins, the other gets the same complaint back instead of an error.
      const inserted = await client.query<{ id: string }>(
        `insert into complaints (id, user_id, side, booking_id, category, subject, priority, idempotency_key) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id, idempotency_key) do nothing returning id`,
        [complaintId, userId, side, session?.id ?? null, category.key, subject, category.urgent ? 'urgent' : 'normal', input.idempotencyKey]);
      if (!inserted.rows[0]) return (await client.query<{ id: string }>(`select id from complaints where user_id = $1 and idempotency_key = $2`, [userId, input.idempotencyKey])).rows[0]!.id;
      await client.query(`insert into complaint_messages (id, complaint_id, sender_kind, sender_user_id, body) values ($1, $2, 'user', $3, $4)`, [uuidv7(), complaintId, userId, input.message]);
      await client.query(`insert into complaint_messages (id, complaint_id, sender_kind, body, created_at) values ($1, $2, 'system', $3, now() + interval '1 millisecond')`, [
        uuidv7(), complaintId, `Thank you. We have your complaint (reference ${code}). The Zoove team will reply here. You will get a notification when we do.`]);
      const who = (await client.query<{ name: string }>(
        `select coalesce(nullif(u.full_name, ''), u.email, u.phone_e164) as name from users u where u.id = $1`, [userId])).rows[0]?.name ?? 'Someone';
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'complaint', $2, 'complaint.raised', $3)`, [
        uuidv7(), complaintId, JSON.stringify({ complaintId, code, side, who, label: category.label, urgent: category.urgent, snippet: preview(input.message, 200), sessionCode: session ? sessionCodeOf(session.id) : null })]);
      return complaintId;
    });
    return this.open(userId, side, id);
  }

  async reply(userId: string, side: ComplaintSide, id: string, body: string): Promise<ComplaintDetail> {
    await this.assertEligible(userId, side);
    await this.db.tx((client) => this.addUserMessage(client, userId, side, id, body));
    return this.open(userId, side, id);
  }

  // A message from the person. If the team had replied or the complaint was resolved, it goes back to the team's open list (and the team is told).
  private async addUserMessage(client: PoolClient, userId: string, side: ComplaintSide, id: string, body: string): Promise<void> {
    const row = (await client.query<{ id: string; code: string; status: ComplaintStatus; resolved_at: Date | null; subject: string }>(
      `select id, code, status, resolved_at, subject from complaints where id = $1 and user_id = $2 and side = $3 for update`, [id, userId, side])).rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'We could not find that complaint.');
    if (!canReplyTo(row.status, row.resolved_at)) throw new DomainError('INVALID_STATE', `This complaint was closed more than ${REOPEN_DAYS} days ago. Please raise a new one.`);
    const recent = await client.query<{ n: string }>(`select count(*) as n from complaint_messages where sender_user_id = $1 and sender_kind = 'user' and created_at > now() - interval '1 hour'`, [userId]);
    if (Number(recent.rows[0]?.n ?? 0) >= MAX_MESSAGES_PER_HOUR) throw new DomainError('TOO_MANY_REQUESTS', 'You are sending messages very quickly. Please wait a little and try again.');
    await client.query(`insert into complaint_messages (id, complaint_id, sender_kind, sender_user_id, body) values ($1, $2, 'user', $3, $4)`, [uuidv7(), id, userId, body]);
    await client.query(`update complaints set status = 'open', resolved_at = null, resolved_by = null, last_message_at = now(), user_read_at = now() where id = $1`, [id]);
    if (row.status !== 'open') {
      const who = (await client.query<{ name: string }>(`select coalesce(nullif(full_name, ''), email, phone_e164) as name from users where id = $1`, [userId])).rows[0]?.name ?? 'Someone';
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'complaint', $2, 'complaint.user_replied', $3)`, [
        uuidv7(), id, JSON.stringify({ complaintId: id, code: row.code, side, who, label: row.subject, urgent: false, reopened: row.status === 'resolved', snippet: preview(body, 200) })]);
    }
  }

  // ================= the Zoove team =================

  async access(adminId: string): Promise<AdminAccess> {
    const profile = (await this.db.query<{ is_owner: boolean; permissions: string[] }>(`select is_owner, permissions from admin_profiles where user_id = $1`, [adminId])).rows[0];
    if (!profile) throw new DomainError('FORBIDDEN', 'This account is not on the admin team. Ask an owner to add you.');
    return { isOwner: profile.is_owner, permissions: profile.permissions };
  }

  private sidesFor(access: AdminAccess): ComplaintSide[] {
    const sides: ComplaintSide[] = [];
    if (access.isOwner || access.permissions.includes('complaints.customers')) sides.push('customer');
    if (access.isOwner || access.permissions.includes('complaints.trainers')) sides.push('trainer');
    if (sides.length === 0) throw new DomainError('FORBIDDEN', 'You do not have access to this. Ask an owner to turn it on for you.');
    return sides;
  }

  private assertSide(access: AdminAccess, side: ComplaintSide): void {
    if (!this.sidesFor(access).includes(side)) throw new DomainError('FORBIDDEN', `You do not have access to ${side} complaints. Ask an owner to turn it on for you.`);
  }

  // The number on the menu: complaints waiting for the team, and how many of those are urgent.
  async summary(adminId: string): Promise<{ open: number; urgent: number }> {
    const sides = this.sidesFor(await this.access(adminId));
    const r = await this.db.query<{ open: string; urgent: string }>(
      `select count(*) as open, count(*) filter (where priority = 'urgent') as urgent from complaints where status = 'open' and side = any($1)`, [sides]);
    return { open: Number(r.rows[0]?.open ?? 0), urgent: Number(r.rows[0]?.urgent ?? 0) };
  }

  async list(adminId: string, query: AdminListQuery): Promise<AdminComplaintRow[]> {
    const access = await this.access(adminId);
    const allowed = this.sidesFor(access);
    if (query.side && !allowed.includes(query.side)) this.assertSide(access, query.side);
    const sides = query.side ? [query.side] : allowed;
    const status = query.status ?? 'active';
    const q = query.q?.trim() ?? '';
    const pattern = q ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null;
    const r = await this.db.query<AdminRowDb>(
      `select c.id, c.code, c.side, c.category, c.subject, c.status, c.priority, c.booking_id, c.assigned_to, c.last_message_at, c.created_at, c.resolved_at,
              ${PERSON_SQL} as person_name, u.phone_e164 as person_phone, ap.display_name as assigned_name, lm.sender_kind as last_from, lm.body as last_body
         from complaints c
         join users u on u.id = c.user_id
         ${TRAINER_APPLICATION_JOIN}
         left join admin_profiles ap on ap.user_id = c.assigned_to
         left join lateral (select sender_kind, body from complaint_messages m where m.complaint_id = c.id and not m.internal order by m.created_at desc limit 1) lm on true
        where c.side = any($1)
          and (($2::text = 'all') or ($2::text = 'active' and c.status <> 'resolved') or c.status = $2::text)
          and ($3::boolean is not true or c.assigned_to = $4)
          and ($5::text is null or c.code ilike $5 or c.subject ilike $5 or u.full_name ilike $5 or u.email ilike $5 or u.phone_e164 like $5
               or ('ZV-' || upper(right(replace(c.booking_id::text, '-', ''), 8))) ilike $5)
        order by (c.status = 'resolved'), (c.status <> 'open'), (c.priority <> 'urgent'),
                 case when c.status = 'resolved' then -extract(epoch from c.last_message_at) else extract(epoch from c.last_message_at) end
        limit $6`,
      [sides, status, query.mine === true, adminId, pattern, query.limit]);
    return r.rows.map(adminRow);
  }

  async get(adminId: string, id: string): Promise<AdminComplaintDetail> {
    const access = await this.access(adminId);
    const allowed = this.sidesFor(access);
    const found = await this.db.query<AdminRowDb & { user_id: string; resolution_note: string | null; resolved_by_name: string | null; person_email: string | null }>(
      `select c.id, c.code, c.side, c.category, c.subject, c.status, c.priority, c.booking_id, c.assigned_to, c.last_message_at, c.created_at, c.resolved_at, c.user_id, c.resolution_note,
              ${PERSON_SQL} as person_name, u.phone_e164 as person_phone, u.email as person_email, ap.display_name as assigned_name, rp.display_name as resolved_by_name, null::text as last_from, null::text as last_body
         from complaints c join users u on u.id = c.user_id ${TRAINER_APPLICATION_JOIN}
         left join admin_profiles ap on ap.user_id = c.assigned_to left join admin_profiles rp on rp.user_id = c.resolved_by
        where c.id = $1`, [id]);
    const c = found.rows[0];
    if (!c) throw new DomainError('NOT_FOUND', 'Complaint not found.');
    this.assertSide(access, c.side);
    const messages = await this.db.query<{ id: string; sender_kind: 'user' | 'admin' | 'system'; internal: boolean; body: string; created_at: Date; author: string | null }>(
      `select m.id, m.sender_kind, m.internal, m.body, m.created_at, ap.display_name as author from complaint_messages m left join admin_profiles ap on ap.user_id = m.sender_user_id and m.sender_kind = 'admin'
        where m.complaint_id = $1 order by m.created_at, m.id`, [id]);
    const totals = await this.db.query<{ total: string; open: string }>(`select count(*) as total, count(*) filter (where status <> 'resolved') as open from complaints where user_id = $1 and side = $2`, [c.user_id, c.side]);
    const related = c.booking_id
      ? (await this.db.query<{ id: string; code: string; side: ComplaintSide; status: ComplaintStatus; subject: string }>(
        `select id, code, side, status, subject from complaints where booking_id = $1 and id <> $2 and side = any($3) order by created_at`, [c.booking_id, id, allowed])).rows
      : [];
    return {
      ...adminRow({ ...c, last_from: messages.rows.at(-1)?.sender_kind ?? null, last_body: messages.rows.at(-1)?.body ?? null }),
      resolutionNote: c.resolution_note, resolvedByName: c.resolved_by_name,
      messages: messages.rows.map((m) => ({ id: m.id, from: m.sender_kind, internal: m.internal, authorName: m.sender_kind === 'admin' ? m.author ?? 'Zoove team' : null, body: m.body, createdAt: m.created_at.toISOString() })),
      person: { id: c.user_id, name: c.person_name, phone: c.person_phone, email: c.person_email, complaintsTotal: Number(totals.rows[0]?.total ?? 0), complaintsOpen: Number(totals.rows[0]?.open ?? 0) },
      session: c.booking_id ? await this.sessionCard(c.booking_id) : null,
      related,
    };
  }

  private async sessionCard(bookingId: string): Promise<AdminSessionCard | null> {
    const r = await this.db.query<{
      id: string; service_name: string; mode: string; status: string; starts_at: Date | null; started_at: Date | null; completed_at: Date | null; address_area: string | null;
      customer_name: string | null; customer_phone: string | null; coach_id: string | null; trainer_first: string | null; trainer_last: string | null; trainer_phone: string | null;
    }>(
      `select b.id, s.name as service_name, b.mode, b.status, b.starts_at, b.started_at, b.completed_at, b.address_area,
              coalesce(nullif(cu.full_name, ''), cu.email) as customer_name, cu.phone_e164 as customer_phone, b.coach_id,
              ta.first_name as trainer_first, ta.last_name as trainer_last, tu.phone_e164 as trainer_phone
         from bookings b join services s on s.id = b.service_id join users cu on cu.id = b.user_id
         left join users tu on tu.id = b.coach_id
         left join lateral (select first_name, last_name from trainer_applications where user_id = b.coach_id order by created_at desc limit 1) ta on true
        where b.id = $1`, [bookingId]);
    const b = r.rows[0];
    if (!b) return null;
    const trainerName = [b.trainer_first, b.trainer_last].filter(Boolean).join(' ') || null;
    return {
      id: b.id, code: sessionCodeOf(b.id), serviceName: b.service_name, mode: b.mode, status: b.status, startsAt: b.starts_at?.toISOString() ?? null,
      startedAt: b.started_at?.toISOString() ?? null, completedAt: b.completed_at?.toISOString() ?? null, area: b.address_area,
      customerName: b.customer_name, customerPhone: b.customer_phone, trainerName: b.coach_id ? trainerName ?? 'Trainer' : null, trainerPhone: b.trainer_phone,
    };
  }

  // Loads and locks a complaint for a change by the team, after checking this admin may handle that side.
  private async lock(client: PoolClient, adminId: string, id: string): Promise<{ id: string; code: string; user_id: string; side: ComplaintSide; status: ComplaintStatus; booking_id: string | null; assigned_to: string | null; subject: string }> {
    const access = await this.access(adminId);
    const row = (await client.query<{ id: string; code: string; user_id: string; side: ComplaintSide; status: ComplaintStatus; booking_id: string | null; assigned_to: string | null; subject: string }>(
      `select id, code, user_id, side, status, booking_id, assigned_to, subject from complaints where id = $1 for update`, [id])).rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'Complaint not found.');
    this.assertSide(access, row.side);
    return row;
  }

  private async audit(client: PoolClient, adminId: string, action: string, id: string, before: unknown, after: unknown): Promise<void> {
    await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, before, after) values ($1, $2, 'complaint', $3, $4, $5)`, [adminId, action, id, JSON.stringify(before), JSON.stringify(after)]);
  }

  // Tells the person the team wrote. Customers get it in their notification list and by push/email; trainers by push.
  private async tellPerson(client: PoolClient, c: { id: string; user_id: string; side: ComplaintSide; booking_id: string | null; code: string }, title: string, body: string): Promise<void> {
    if (c.side === 'customer') {
      await notifyCustomer(client, c.user_id, title, body, c.booking_id, { complaintId: c.id });
    } else {
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'complaint', $2, 'complaint.trainer_reply', $3)`, [
        uuidv7(), c.id, JSON.stringify({ userId: c.user_id, complaintId: c.id, title, body })]);
    }
  }

  async adminReply(adminId: string, id: string, body: string): Promise<AdminComplaintDetail> {
    await this.db.tx(async (client) => {
      const c = await this.lock(client, adminId, id);
      if (c.status === 'resolved') throw new DomainError('INVALID_STATE', 'This complaint is resolved. Reopen it to reply.');
      await client.query(`insert into complaint_messages (id, complaint_id, sender_kind, sender_user_id, body) values ($1, $2, 'admin', $3, $4)`, [uuidv7(), id, adminId, body]);
      await client.query(`update complaints set status = 'waiting_on_user', last_message_at = now(), last_admin_reply_at = now(), assigned_to = coalesce(assigned_to, $2) where id = $1`, [id, adminId]);
      await this.audit(client, adminId, 'complaint.replied', id, { status: c.status }, { status: 'waiting_on_user', length: body.length });
      await this.tellPerson(client, c, `${TEAM_NAME} replied · ${c.code}`, preview(body, 140));
    });
    return this.get(adminId, id);
  }

  // A note for the team. The person never sees it, and it sends no notification.
  async adminNote(adminId: string, id: string, body: string): Promise<AdminComplaintDetail> {
    await this.db.tx(async (client) => {
      await this.lock(client, adminId, id);
      await client.query(`insert into complaint_messages (id, complaint_id, sender_kind, sender_user_id, body, internal) values ($1, $2, 'admin', $3, $4, true)`, [uuidv7(), id, adminId, body]);
    });
    return this.get(adminId, id);
  }

  async adminAssign(adminId: string, id: string, assigneeId: string | null): Promise<AdminComplaintDetail> {
    await this.db.tx(async (client) => {
      const c = await this.lock(client, adminId, id);
      let name = 'nobody';
      if (assigneeId) {
        const target = (await client.query<{ display_name: string }>(`select display_name from admin_profiles where user_id = $1`, [assigneeId])).rows[0];
        if (!target) throw new DomainError('INVALID_REQUEST', 'That person is not on the admin team.');
        name = target.display_name;
      }
      await client.query(`update complaints set assigned_to = $2 where id = $1`, [id, assigneeId]);
      await client.query(`insert into complaint_messages (id, complaint_id, sender_kind, sender_user_id, body, internal) values ($1, $2, 'admin', $3, $4, true)`, [uuidv7(), id, adminId, assigneeId ? `Assigned to ${name}.` : 'Unassigned.']);
      await this.audit(client, adminId, 'complaint.assigned', id, { assignedTo: c.assigned_to }, { assignedTo: assigneeId });
    });
    return this.get(adminId, id);
  }

  async adminResolve(adminId: string, id: string, note: string): Promise<AdminComplaintDetail> {
    await this.db.tx(async (client) => {
      const c = await this.lock(client, adminId, id);
      if (c.status === 'resolved') throw new DomainError('INVALID_STATE', 'This complaint is already resolved.');
      // The note is what the person reads, so it is shown in the thread as the team's last message.
      await client.query(`insert into complaint_messages (id, complaint_id, sender_kind, sender_user_id, body) values ($1, $2, 'admin', $3, $4)`, [uuidv7(), id, adminId, note]);
      await client.query(
        `insert into complaint_messages (id, complaint_id, sender_kind, body, created_at) values ($1, $2, 'system', $3, now() + interval '1 millisecond')`,
        [uuidv7(), id, `This complaint is marked resolved. If it is not sorted, reply here within ${REOPEN_DAYS} days and we will pick it up again.`]);
      await client.query(
        `update complaints set status = 'resolved', resolved_at = now(), resolved_by = $2, resolution_note = $3, last_message_at = now(), last_admin_reply_at = now(), assigned_to = coalesce(assigned_to, $2) where id = $1`,
        [id, adminId, note]);
      await this.audit(client, adminId, 'complaint.resolved', id, { status: c.status }, { status: 'resolved', note });
      await this.tellPerson(client, c, `Complaint resolved · ${c.code}`, preview(note, 140));
    });
    return this.get(adminId, id);
  }

  async adminReopen(adminId: string, id: string): Promise<AdminComplaintDetail> {
    await this.db.tx(async (client) => {
      const c = await this.lock(client, adminId, id);
      if (c.status !== 'resolved') throw new DomainError('INVALID_STATE', 'This complaint is not resolved.');
      await client.query(`update complaints set status = 'open', resolved_at = null, resolved_by = null, last_message_at = now() where id = $1`, [id]);
      await client.query(`insert into complaint_messages (id, complaint_id, sender_kind, sender_user_id, body, internal) values ($1, $2, 'admin', $3, 'Reopened.', true)`, [uuidv7(), id, adminId]);
      await this.audit(client, adminId, 'complaint.reopened', id, { status: 'resolved' }, { status: 'open' });
    });
    return this.get(adminId, id);
  }

  // The team members a complaint can be assigned to.
  async assignees(adminId: string): Promise<{ id: string; name: string }[]> {
    this.sidesFor(await this.access(adminId));
    const r = await this.db.query<{ user_id: string; display_name: string }>(`select user_id, display_name from admin_profiles order by display_name`);
    return r.rows.map((a) => ({ id: a.user_id, name: a.display_name }));
  }

  // For the pages of a session, a customer or a trainer: their complaints, newest first.
  async forSession(adminId: string, bookingId: string): Promise<{ id: string; code: string; side: ComplaintSide; status: ComplaintStatus; subject: string }[]> {
    const sides = this.sidesFor(await this.access(adminId));
    const r = await this.db.query<{ id: string; code: string; side: ComplaintSide; status: ComplaintStatus; subject: string }>(
      `select id, code, side, status, subject from complaints where booking_id = $1 and side = any($2) order by created_at desc`, [bookingId, sides]);
    return r.rows;
  }

  async forPerson(adminId: string, userId: string): Promise<{ id: string; code: string; side: ComplaintSide; status: ComplaintStatus; subject: string; createdAt: string }[]> {
    const sides = this.sidesFor(await this.access(adminId));
    const r = await this.db.query<{ id: string; code: string; side: ComplaintSide; status: ComplaintStatus; subject: string; created_at: Date }>(
      `select id, code, side, status, subject, created_at from complaints where user_id = $1 and side = any($2) order by created_at desc limit 50`, [userId, sides]);
    return r.rows.map((x) => ({ id: x.id, code: x.code, side: x.side, status: x.status, subject: x.subject, createdAt: x.created_at.toISOString() }));
  }
}

type AdminRowDb = {
  id: string; code: string; side: ComplaintSide; category: string; subject: string; status: ComplaintStatus; priority: ComplaintPriority; booking_id: string | null; assigned_to: string | null;
  last_message_at: Date; created_at: Date; resolved_at: Date | null; person_name: string; person_phone: string | null; assigned_name: string | null; last_from: string | null; last_body: string | null;
};
function adminRow(r: AdminRowDb): AdminComplaintRow {
  return {
    id: r.id, code: r.code, side: r.side, category: r.category, categoryLabel: labelOf(r.category), subject: r.subject, status: r.status, urgent: r.priority === 'urgent' && r.status !== 'resolved',
    personName: r.person_name ?? 'Unknown', personPhone: r.person_phone, sessionCode: r.booking_id ? sessionCodeOf(r.booking_id) : null, assignedToId: r.assigned_to, assignedToName: r.assigned_name,
    lastMessage: r.last_from && r.last_body ? { from: r.last_from as 'user' | 'admin' | 'system', body: preview(r.last_body) } : null,
    lastMessageAt: r.last_message_at.toISOString(), createdAt: r.created_at.toISOString(), resolvedAt: r.resolved_at?.toISOString() ?? null,
  };
}
