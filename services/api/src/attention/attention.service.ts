import { Injectable } from '@nestjs/common';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { sessionCodeOf } from '../bookings/bookings.service';
import { formatWhen } from '../bookings/rules';
import type { Permission } from '../identity/permissions';

// One thing that needs a person at Zoove to look at it. `href` is the admin page where it is handled.
export type AttentionItem = { id: string; title: string; detail: string; since: string; href: string; urgent: boolean };
export type AttentionGroup = { key: string; title: string; hint: string; href: string; items: AttentionItem[] };
export type Attention = { total: number; urgent: number; groups: AttentionGroup[]; generatedAt: string };

const LIMIT = 25;

type SessionRow = { id: string; service_name: string; starts_at: Date | null; mode: string; address_area: string | null; created_at: Date; trainer_cancelled_at: Date | null; unfilled_notified_at: Date | null; customer: string | null };

// A read-only roundup of what the team should act on now. It only reads: the pages it links to do the work. Each group is
// shown only to admins who may handle it, so nobody sees an alert they cannot act on.
@Injectable()
export class AttentionService {
  constructor(private readonly db: DatabaseService) {}

  private async allowed(userId: string): Promise<(permission: Permission) => boolean> {
    const profile = (await this.db.query<{ is_owner: boolean; permissions: string[] }>(`select is_owner, permissions from admin_profiles where user_id = $1`, [userId])).rows[0];
    if (!profile) throw new DomainError('FORBIDDEN', 'This account is not on the admin team. Ask an owner to add you.');
    return (permission) => profile.is_owner || profile.permissions.includes(permission);
  }

  async get(userId: string): Promise<Attention> {
    const can = await this.allowed(userId);
    const now = new Date();
    const groups: AttentionGroup[] = [];

    if (can('sessions.manage')) {
      const base = `select b.id, s.name as service_name, b.starts_at, b.mode, b.address_area, b.created_at, b.trainer_cancelled_at, b.unfilled_notified_at, coalesce(u.full_name, u.email) as customer
                      from bookings b join services s on s.id = b.service_id join users u on u.id = b.user_id`;
      const open = (await this.db.query<SessionRow>(`${base} where b.status = 'matching' order by (b.starts_at is not null and b.starts_at <= now()) desc, b.starts_at nulls first, b.created_at limit ${LIMIT}`)).rows;
      const cancelled = (await this.db.query<SessionRow>(`${base} where b.status = 'rematching' and b.trainer_cancelled_at is not null order by b.trainer_cancelled_at limit ${LIMIT}`)).rows;
      const unconfirmedStart = (await this.db.query<SessionRow>(
        `${base} where b.status = 'confirmed' and b.started_at is null and b.starts_at is not null and b.starts_at <= now() order by b.starts_at limit ${LIMIT}`)).rows;
      // A trainer was paused, suspended or revoked while still holding sessions. Those sessions are not on their app any more, so nobody will go.
      const orphaned = (await this.db.query<SessionRow & { trainer_status: string }>(
        `select b.id, s.name as service_name, b.starts_at, b.mode, b.address_area, b.created_at, b.trainer_cancelled_at, b.unfilled_notified_at, coalesce(u.full_name, u.email) as customer, t.status as trainer_status
           from bookings b join services s on s.id = b.service_id join users u on u.id = b.user_id join trainers t on t.user_id = b.coach_id
          where b.status = 'confirmed' and b.started_at is null and t.status <> 'active' and (b.starts_at is null or b.starts_at > now() - interval '3 hours')
          order by b.starts_at nulls first limit ${LIMIT}`)).rows;
      const lowRated = (await this.db.query<{ id: string; stars: number; created_at: Date; service_name: string; comment: string | null }>(
        `select b.id, r.stars, r.created_at, s.name as service_name, r.comment from session_ratings r join bookings b on b.id = r.booking_id join services s on s.id = b.service_id
          where r.stars <= 2 and r.created_at > now() - interval '7 days' order by r.created_at desc limit ${LIMIT}`)).rows;

      const session = (row: SessionRow, detail: string, since: Date, urgent: boolean): AttentionItem => ({
        id: row.id, title: `${row.service_name} · ${sessionCodeOf(row.id)}`, detail, since: since.toISOString(), href: '/sessions', urgent,
      });
      const where = (row: SessionRow) => [row.starts_at ? formatWhen(row.starts_at) : 'As soon as possible', row.address_area, row.customer].filter(Boolean).join(' · ');
      groups.push(
        { key: 'no_trainer', title: 'Booked, no trainer has accepted', hint: 'Open the session and assign a trainer, or move it to another time.', href: '/sessions',
          items: open.map((r) => session(r, where(r), r.created_at, (r.starts_at !== null && r.starts_at <= now) || r.unfilled_notified_at !== null)) },
        { key: 'trainer_cancelled', title: 'Trainer cancelled, needs a new trainer', hint: 'The customer is waiting. Assign another trainer.', href: '/sessions',
          items: cancelled.map((r) => session(r, where(r), r.trainer_cancelled_at ?? r.created_at, true)) },
        { key: 'not_started', title: 'Start time passed, session not started', hint: 'The trainer may be late or a no-show. Call them and the customer.', href: '/sessions',
          items: unconfirmedStart.map((r) => session(r, where(r), r.starts_at ?? r.created_at, true)) },
        { key: 'trainer_inactive', title: 'Session is on a trainer who is no longer active', hint: 'Open the session, record the trainer as cancelled and assign someone else, or call the customer.', href: '/sessions',
          items: orphaned.map((r) => session(r, `${where(r)} · trainer ${r.trainer_status}`, r.starts_at ?? r.created_at, true)) },
        { key: 'low_rating', title: 'Low ratings this week', hint: 'A customer gave 1 or 2 stars. Read the session and follow up.', href: '/sessions',
          items: lowRated.map((r) => ({ id: r.id, title: `${r.stars} ${r.stars === 1 ? 'star' : 'stars'} · ${r.service_name} · ${sessionCodeOf(r.id)}`, detail: r.comment ?? 'No comment left', since: r.created_at.toISOString(), href: '/sessions', urgent: false })) },
      );
    }

    if (can('parties.manage')) {
      const rows = (await this.db.query<{ id: string; occasion: string; guests: number; starts_at: Date; created_at: Date; contact_name: string | null }>(
        `select id, occasion, guests, starts_at, created_at, contact_name from party_requests where status = 'new' order by starts_at limit ${LIMIT}`)).rows;
      groups.push({ key: 'parties', title: 'Party requests waiting for a call', hint: 'Call the customer, agree details, then mark it confirmed.', href: '/parties',
        items: rows.map((r) => ({ id: r.id, title: `${r.occasion} · ${r.guests} guests`, detail: `${formatWhen(r.starts_at)}${r.contact_name ? ` · ${r.contact_name}` : ''}`, since: r.created_at.toISOString(), href: '/parties', urgent: false })) });
    }

    if (can('trainers.view')) {
      const rows = (await this.db.query<{ id: string; name: string; submitted_at: Date | null; created_at: Date }>(
        `select id, trim(concat_ws(' ', first_name, last_name)) as name, submitted_at, created_at from trainer_applications where status in ('submitted', 'in_review') order by coalesce(submitted_at, created_at) limit ${LIMIT}`)).rows;
      groups.push({ key: 'applications', title: 'Trainer applications to review', hint: 'Approve, reject or ask for changes.', href: '/',
        items: rows.map((r) => ({ id: r.id, title: r.name || 'New applicant', detail: 'Waiting for review', since: (r.submitted_at ?? r.created_at).toISOString(), href: `/applications/${r.id}`, urgent: false })) });
    }

    if (can('trainers.view')) {
      const rows = (await this.db.query<{ id: string; kind: string; new_value: string; created_at: Date; name: string }>(
        `select q.id, q.kind, q.new_value, q.created_at, coalesce(nullif(trim(concat_ws(' ', a.first_name, a.last_name)), ''), 'Trainer') as name
           from trainer_contact_requests q left join trainer_applications a on a.user_id = q.user_id where q.status = 'pending' order by q.created_at limit ${LIMIT}`)).rows;
      groups.push({ key: 'trainer_requests', title: 'Trainers asking to change their email or mobile', hint: 'Check it is really them (a call is best), then approve or reject.', href: '/trainer-requests',
        items: rows.map((r) => ({ id: r.id, title: r.name, detail: `New ${r.kind === 'email' ? 'email' : 'mobile'}: ${r.new_value}`, since: r.created_at.toISOString(), href: '/trainer-requests', urgent: false })) });
    }

    if (can('packages.manage')) {
      const rows = (await this.db.query<{ id: string; name: string; total_paise: number; created_at: Date }>(
        `select id, name, total_paise, created_at from package_purchases where status = 'awaiting_payment' and created_at < now() - interval '1 day' order by created_at limit ${LIMIT}`)).rows;
      groups.push({ key: 'packages', title: 'Package orders unpaid for over a day', hint: 'Follow up with the customer, or leave if they changed their mind.', href: '/packages',
        items: rows.map((r) => ({ id: r.id, title: r.name, detail: `₹${Math.round(r.total_paise / 100).toLocaleString('en-IN')} awaiting payment`, since: r.created_at.toISOString(), href: '/packages', urgent: false })) });
    }

    // Owners only: delivery problems are about the system, not about a customer.
    if (can('sessions.manage') && (await this.isOwner(userId))) {
      const rows = (await this.db.query<{ event_id: string; destination: string; last_error: string | null; updated_at: Date }>(
        `select event_id, destination, last_error, updated_at from event_deliveries where status = 'failed' and updated_at > now() - interval '3 days' order by updated_at desc limit ${LIMIT}`)).rows;
      groups.push({ key: 'delivery_failed', title: 'Messages that could not be sent', hint: 'An email or push to a customer or trainer failed. See the reason.', href: '/sessions',
        items: rows.map((r) => ({ id: `${r.event_id}:${r.destination}`, title: r.destination.replace('notify:', ''), detail: (r.last_error ?? 'Unknown reason').slice(0, 140), since: r.updated_at.toISOString(), href: '/sessions', urgent: false })) });
    }

    const shown = groups.filter((g) => g.items.length > 0);
    return {
      total: shown.reduce((n, g) => n + g.items.length, 0),
      urgent: shown.reduce((n, g) => n + g.items.filter((i) => i.urgent).length, 0),
      groups: shown,
      generatedAt: now.toISOString(),
    };
  }

  private async isOwner(userId: string): Promise<boolean> {
    return (await this.db.query<{ is_owner: boolean }>(`select is_owner from admin_profiles where user_id = $1`, [userId])).rows[0]?.is_owner === true;
  }
}
