import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { PERMISSION_KEYS, normalisePermissions, type Permission } from '../identity/permissions';

export type Member = {
  id: string;
  name: string;
  email: string | null;
  jobTitle: string;
  isOwner: boolean;
  reportsTo: { id: string; name: string } | null;
  permissions: Permission[]; // what they can actually do: everything for an owner
  active: boolean;
  lastLoginAt: string | null;
  invitedAt: string;
  invitedBy: string | null;
};

type Row = {
  id: string;
  display_name: string;
  verified_email: string | null;
  job_title: string;
  is_owner: boolean;
  reports_to: string | null;
  reports_to_name: string | null;
  permissions: string[];
  status: string;
  last_login_at: Date | null;
  invited_at: Date;
  invited_by_name: string | null;
};

const SELECT = `
  select u.id, p.display_name, u.verified_email, p.job_title, p.is_owner, p.reports_to, rt.display_name as reports_to_name,
         p.permissions, u.status, u.last_login_at, p.invited_at, ib.display_name as invited_by_name
    from admin_profiles p
    join users u on u.id = p.user_id
    left join admin_profiles rt on rt.user_id = p.reports_to
    left join admin_profiles ib on ib.user_id = p.invited_by`;

const toMember = (row: Row): Member => ({
  id: row.id,
  name: row.display_name,
  email: row.verified_email,
  jobTitle: row.job_title,
  isOwner: row.is_owner,
  reportsTo: row.reports_to ? { id: row.reports_to, name: row.reports_to_name ?? 'Unknown' } : null,
  permissions: row.is_owner ? [...PERMISSION_KEYS] : normalisePermissions(row.permissions),
  active: row.status === 'active',
  lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
  invitedAt: row.invited_at.toISOString(),
  invitedBy: row.invited_by_name,
});

export type AddInput = { name: string; email: string; jobTitle: string; reportsTo?: string | null | undefined; permissions: string[]; isOwner?: boolean | undefined };
export type UpdateInput = { name?: string; jobTitle?: string; reportsTo?: string | null; permissions?: string[]; isOwner?: boolean; active?: boolean };

@Injectable()
export class TeamService {
  constructor(private readonly db: DatabaseService) {}

  // The signed-in admin's own profile (shown in the panel and used to hide what they cannot use).
  async me(userId: string): Promise<Member> {
    const result = await this.db.query<Row>(`${SELECT} where u.id = $1`, [userId]);
    const row = result.rows[0];
    if (!row) throw new DomainError('FORBIDDEN', 'This account is not on the admin team. Ask an owner to add you.');
    return toMember(row);
  }

  async list(): Promise<Member[]> {
    const result = await this.db.query<Row>(`${SELECT} order by p.is_owner desc, p.invited_at, p.display_name`);
    return result.rows.map(toMember);
  }

  async add(actorId: string, input: AddInput): Promise<Member> {
    const email = input.email.trim().toLowerCase();
    const permissions = normalisePermissions(input.permissions);
    const id = await this.db.tx(async (client) => {
      const actor = await client.query<{ display_name: string }>(`select display_name from admin_profiles where user_id = $1`, [actorId]);
      await this.assertReportsTo(client, input.reportsTo ?? null, null);

      const existing = await client.query<{ id: string; status: string }>(`select id, status from users where verified_email = $1 for update`, [email]);
      let userId: string;
      const found = existing.rows[0];
      if (found) {
        if (found.status !== 'active') throw new DomainError('ACCOUNT_BLOCKED', 'That email belongs to a blocked account.');
        const already = await client.query(`select 1 from admin_profiles where user_id = $1`, [found.id]);
        if (already.rows[0]) throw new DomainError('EMAIL_TAKEN', 'That person is already on the team.');
        userId = found.id;
        await client.query(`update users set full_name = coalesce(full_name, $2) where id = $1`, [userId, input.name]);
      } else {
        userId = uuidv7();
        await client.query(`insert into users (id, verified_email, full_name) values ($1, $2, $3)`, [userId, email, input.name]);
      }
      await client.query(`insert into user_roles (user_id, role) values ($1, 'admin') on conflict do nothing`, [userId]);
      await client.query(
        `insert into admin_profiles (user_id, display_name, job_title, is_owner, reports_to, permissions, invited_by) values ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, input.name, input.jobTitle, input.isOwner === true, input.reportsTo ?? null, permissions, actorId],
      );
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'team.member_added', 'admin_profile', $2, $3)`, [
        actorId,
        userId,
        JSON.stringify({ email, name: input.name, jobTitle: input.jobTitle, isOwner: input.isOwner === true, permissions }),
      ]);
      // The invite email goes out through the outbox, so it is retried if the email service is down.
      await client.query(`insert into outbox_events (aggregate_type, aggregate_id, event_type, payload) values ('team_member', $1, 'team.member_invited', $2)`, [
        userId,
        JSON.stringify({ email, name: input.name, jobTitle: input.jobTitle, invitedBy: actor.rows[0]?.display_name ?? 'The Zoove team' }),
      ]);
      return userId;
    });
    return this.one(id);
  }

  async update(actorId: string, id: string, patch: UpdateInput): Promise<Member> {
    await this.db.tx(async (client) => {
      const current = await client.query<{ display_name: string; job_title: string; is_owner: boolean; reports_to: string | null; permissions: string[]; status: string }>(
        `select p.display_name, p.job_title, p.is_owner, p.reports_to, p.permissions, u.status
           from admin_profiles p join users u on u.id = p.user_id where p.user_id = $1 for update of p, u`,
        [id],
      );
      const before = current.rows[0];
      if (!before) throw new DomainError('NOT_FOUND', 'Team member not found.');
      if (patch.active === false && id === actorId) throw new DomainError('INVALID_STATE', 'You cannot switch off your own account.');
      if (patch.reportsTo !== undefined) await this.assertReportsTo(client, patch.reportsTo, id);

      const next = {
        name: patch.name ?? before.display_name,
        jobTitle: patch.jobTitle ?? before.job_title,
        isOwner: patch.isOwner ?? before.is_owner,
        reportsTo: patch.reportsTo === undefined ? before.reports_to : patch.reportsTo,
        permissions: patch.permissions ? normalisePermissions(patch.permissions) : before.permissions,
      };
      await client.query(`update admin_profiles set display_name = $2, job_title = $3, is_owner = $4, reports_to = $5, permissions = $6 where user_id = $1`, [
        id,
        next.name,
        next.jobTitle,
        next.isOwner,
        next.reportsTo,
        next.permissions,
      ]);

      if (patch.active !== undefined) {
        if (patch.active && before.status === 'deleted') throw new DomainError('INVALID_STATE', 'This account was deleted.');
        await client.query(`update users set status = $2 where id = $1`, [id, patch.active ? 'active' : 'blocked']);
        // Signing out everywhere: the access token already stops working at once, this stops refreshing too.
        if (!patch.active) await client.query(`update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null`, [id]);
      }

      // Never leave the team without an owner who can sign in.
      const owners = await client.query<{ n: number }>(
        `select count(*)::int as n from admin_profiles p join users u on u.id = p.user_id where p.is_owner and u.status = 'active'`,
      );
      if ((owners.rows[0]?.n ?? 0) < 1) throw new DomainError('INVALID_STATE', 'There must be at least one active owner.');

      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, before, after) values ($1, 'team.member_updated', 'admin_profile', $2, $3, $4)`, [
        actorId,
        id,
        JSON.stringify({ name: before.display_name, jobTitle: before.job_title, isOwner: before.is_owner, reportsTo: before.reports_to, permissions: before.permissions, active: before.status === 'active' }),
        JSON.stringify({ ...next, active: patch.active ?? before.status === 'active' }),
      ]);
    });
    return this.one(id);
  }

  private async one(id: string): Promise<Member> {
    const result = await this.db.query<Row>(`${SELECT} where u.id = $1`, [id]);
    const row = result.rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'Team member not found.');
    return toMember(row);
  }

  private async assertReportsTo(client: PoolClient, reportsTo: string | null, self: string | null): Promise<void> {
    if (!reportsTo) return;
    if (reportsTo === self) throw new DomainError('INVALID_REQUEST', 'Someone cannot report to themselves.');
    const found = await client.query(`select 1 from admin_profiles where user_id = $1`, [reportsTo]);
    if (!found.rows[0]) throw new DomainError('INVALID_REQUEST', 'The person they report to is not on the team.');
  }
}
