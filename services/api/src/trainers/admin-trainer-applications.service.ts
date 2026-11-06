import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { SIGNED_LINK_SECONDS } from './rules';
import { TrainerApplicationsService, type ApplicationStatus, type TrainerStatus } from './trainer-applications.service';

// What ops may correct on a trainer's profile. Not the sign-in email or phone (those are the trainer's login) and not the ID numbers.
export type ProfileEdit = {
  firstName?: string; lastName?: string; dateOfBirth?: string; gender?: string; addressLine?: string; addressArea?: string; addressPincode?: string;
  specialties?: string[]; experienceYears?: number; languages?: string[]; bio?: string;
};
const PROFILE_COLUMNS: Record<keyof ProfileEdit, string> = {
  firstName: 'first_name', lastName: 'last_name', dateOfBirth: 'date_of_birth', gender: 'gender', addressLine: 'address_line', addressArea: 'address_area', addressPincode: 'address_pincode',
  specialties: 'specialties', experienceYears: 'experience_years', languages: 'languages', bio: 'bio',
};

export type AdminListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: ApplicationStatus;
  specialties: string[];
  experienceYears: number | null;
  source: string | null;
  submittedAt: string | null;
  trainerStatus: TrainerStatus | null;
  /** The trainer's own on/off switch. Null until they are an approved trainer. */
  acceptingJobs: boolean | null;
};

export type AdminList = { items: AdminListItem[]; counts: Record<string, number> };

type ListRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_e164: string | null;
  email: string | null;
  status: ApplicationStatus;
  specialties: string[];
  experience_years: number | null;
  source: string | null;
  submitted_at: Date | null;
  trainer_status: TrainerStatus | null;
  accepting_jobs: boolean | null;
};

const REVIEWABLE: ApplicationStatus[] = ['submitted', 'in_review'];

@Injectable()
export class AdminTrainerApplicationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly applications: TrainerApplicationsService,
  ) {}

  async list(filter: { status?: ApplicationStatus | 'pending'; search?: string; limit: number }): Promise<AdminList> {
    const params: unknown[] = [];
    const where: string[] = [`a.status <> 'draft'`];
    if (filter.status === 'pending') where.push(`a.status in ('submitted', 'in_review')`);
    else if (filter.status) {
      params.push(filter.status);
      where.push(`a.status = $${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      where.push(`(lower(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')) like $${params.length} or coalesce(a.phone_e164, u.phone_e164, '') like $${params.length} or lower(coalesce(a.email, '')) like $${params.length})`);
    }
    params.push(filter.limit);
    const items = await this.db.query<ListRow>(
      `select a.id, a.first_name, a.last_name, coalesce(a.phone_e164, u.phone_e164) as phone_e164, a.email, a.status, a.specialties, a.experience_years, a.source, a.submitted_at, t.status as trainer_status, t.accepting_jobs
         from trainer_applications a join users u on u.id = a.user_id left join trainers t on t.application_id = a.id
        where ${where.join(' and ')}
        order by a.submitted_at asc nulls last, a.created_at asc
        limit $${params.length}`,
      params,
    );
    const counts = await this.db.query<{ status: string; n: string }>(`select status, count(*) n from trainer_applications where status <> 'draft' group by status`);
    return {
      items: items.rows.map((row) => ({
        id: row.id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed',
        phone: row.phone_e164,
        email: row.email,
        status: row.status,
        specialties: row.specialties,
        experienceYears: row.experience_years,
        source: row.source,
        submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
        trainerStatus: row.trainer_status,
        acceptingJobs: row.trainer_status ? row.accepting_jobs : null,
      })),
      counts: Object.fromEntries(counts.rows.map((row) => [row.status, Number(row.n)])),
    };
  }

  async detail(applicationId: string) {
    const found = await this.db.query<{ user_id: string; phone_e164: string | null }>(
      `select a.user_id, coalesce(a.phone_e164, u.phone_e164) as phone_e164 from trainer_applications a join users u on u.id = a.user_id where a.id = $1 and a.status <> 'draft'`,
      [applicationId],
    );
    const owner = found.rows[0];
    if (!owner) throw new DomainError('NOT_FOUND', 'Application not found.');
    const view = await this.applications.get(owner.user_id);
    const events = await this.db.query<{ type: string; actor: string; payload: object; created_at: Date }>(
      `select type, actor, payload, created_at from trainer_application_events where application_id = $1 order by created_at`,
      [applicationId],
    );
    const source = await this.db.query<{ source: string | null }>(`select source from trainer_applications where id = $1`, [applicationId]);
    const sw = await this.db.query<{ accepting_jobs: boolean }>(`select accepting_jobs from trainers where application_id = $1`, [applicationId]);
    return {
      ...view,
      acceptingJobs: sw.rows[0] ? sw.rows[0].accepting_jobs : null,
      phone: owner.phone_e164,
      source: source.rows[0]?.source ?? null,
      events: events.rows.map((event) => ({ type: event.type, actor: event.actor, payload: event.payload, at: event.created_at.toISOString() })),
    };
  }

  // Every time a reviewer opens a document it is recorded: these are identity documents.
  async documentLink(adminId: string, applicationId: string, documentId: string): Promise<{ url: string; expiresInSeconds: number }> {
    const found = await this.db.query<{ storage_key: string; kind: string }>(
      `select storage_key, kind from trainer_documents where id = $1 and application_id = $2 and status <> 'replaced'`,
      [documentId, applicationId],
    );
    const doc = found.rows[0];
    if (!doc) throw new DomainError('NOT_FOUND', 'Document not found.');
    const url = await this.applications.signedUrl(doc.storage_key);
    await this.db.query(
      `insert into audit_log (id, actor_user_id, action, entity_type, entity_id, after) values ($1, $2, 'trainer_document.view', 'trainer_document', $3, $4)`,
      [uuidv7(), adminId, documentId, JSON.stringify({ applicationId, kind: doc.kind })],
    );
    return { url, expiresInSeconds: SIGNED_LINK_SECONDS };
  }

  startReview(adminId: string, applicationId: string) {
    return this.transition(adminId, applicationId, ['submitted'], async (client) => {
      await client.query(`update trainer_applications set status = 'in_review' where id = $1`, [applicationId]);
      await this.applications.event(client, applicationId, 'review_started', 'admin', adminId, {});
    });
  }

  approve(adminId: string, applicationId: string, note: string | undefined) {
    return this.transition(adminId, applicationId, REVIEWABLE, async (client, app) => {
      const certificates = await client.query<{ n: string }>(
        `select count(*) n from trainer_documents where application_id = $1 and kind = 'certificate' and status not in ('replaced', 'rejected')`,
        [applicationId],
      );
      if (Number(certificates.rows[0]?.n ?? 0) === 0) throw new DomainError('INVALID_STATE', 'A certificate is required. Use Request changes to ask the trainer to add one.');
      await client.query(
        `update trainer_applications set status = 'approved', reviewed_at = now(), reviewed_by = $2, review_note = $3 where id = $1`,
        [applicationId, adminId, note ?? null],
      );
      await client.query(`update trainer_documents set status = 'accepted', reviewed_at = now() where application_id = $1 and status = 'uploaded'`, [applicationId]);
      await client.query(`insert into trainers (user_id, application_id) values ($1, $2) on conflict (user_id) do nothing`, [app.userId, applicationId]);
      await client.query(`insert into user_roles (user_id, role) values ($1, 'trainer') on conflict do nothing`, [app.userId]);
      await this.applications.event(client, applicationId, 'approved', 'admin', adminId, { note: note ?? null });
      await this.applications.publish(client, applicationId, 'trainer.application_approved', {});
    });
  }

  reject(adminId: string, applicationId: string, reason: string) {
    return this.transition(adminId, applicationId, REVIEWABLE, async (client) => {
      await client.query(
        `update trainer_applications set status = 'rejected', reviewed_at = now(), reviewed_by = $2, review_note = $3 where id = $1`,
        [applicationId, adminId, reason],
      );
      await this.applications.event(client, applicationId, 'rejected', 'admin', adminId, { reason });
      await this.applications.publish(client, applicationId, 'trainer.application_rejected', {});
    });
  }

  requestChanges(adminId: string, applicationId: string, note: string, documentIds: string[]) {
    return this.transition(adminId, applicationId, REVIEWABLE, async (client) => {
      if (documentIds.length > 0) {
        const marked = await client.query(
          `update trainer_documents set status = 'rejected', reviewer_note = $3, reviewed_at = now()
            where application_id = $1 and id = any($2) and status <> 'replaced'`,
          [applicationId, documentIds, note],
        );
        if (marked.rowCount !== documentIds.length) throw new DomainError('INVALID_REQUEST', 'Some documents do not belong to this application.');
      }
      await client.query(
        `update trainer_applications set status = 'changes_requested', reviewed_at = now(), reviewed_by = $2, review_note = $3 where id = $1`,
        [applicationId, adminId, note],
      );
      await this.applications.event(client, applicationId, 'changes_requested', 'admin', adminId, { note, documentIds });
      await this.applications.publish(client, applicationId, 'trainer.application_changes_requested', {});
    });
  }

  // Ops correct a trainer's details (any application that was submitted). Every change is written to the history and the audit log
  // with the old and new values of the fields that changed.
  async updateProfile(adminId: string, applicationId: string, edit: ProfileEdit): Promise<ReturnType<AdminTrainerApplicationsService['detail']>> {
    if (edit.specialties !== undefined) await this.applications.assertKnownServices(edit.specialties);
    await this.db.tx(async (client) => {
      const found = await client.query<Record<string, unknown>>(
        `select first_name, last_name, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, gender, address_line, address_area, address_pincode, specialties, experience_years, languages, bio
           from trainer_applications where id = $1 and status <> 'draft' for update`, [applicationId]);
      const before = found.rows[0];
      if (!before) throw new DomainError('NOT_FOUND', 'Application not found.');
      const sets: string[] = [];
      const params: unknown[] = [applicationId];
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(PROFILE_COLUMNS) as (keyof ProfileEdit)[]) {
        const value = edit[key];
        if (value === undefined) continue;
        const column = PROFILE_COLUMNS[key];
        const next = key === 'bio' && value === '' ? null : value;
        if (JSON.stringify(before[column]) === JSON.stringify(next)) continue;
        params.push(next);
        sets.push(`${column} = $${params.length}`);
        changed[key] = { from: before[column] ?? null, to: next };
      }
      if (sets.length === 0) return;
      await client.query(`update trainer_applications set ${sets.join(', ')} where id = $1`, params);
      await this.applications.event(client, applicationId, 'profile_edited', 'admin', adminId, { changed: Object.keys(changed) });
      await client.query(
        `insert into audit_log (id, actor_user_id, action, entity_type, entity_id, before, after) values ($1, $2, 'trainer.profile_edited', 'trainer_application', $3, $4, $5)`,
        [uuidv7(), adminId, applicationId, JSON.stringify(Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.from]))), JSON.stringify(Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])))],
      );
    });
    return this.detail(applicationId);
  }

  // Pause, suspend, revoke or resume an approved trainer. The reason is internal: it goes in the history and the audit log, never to the trainer.
  async setTrainerStatus(adminId: string, applicationId: string, target: TrainerStatus, reason: string | undefined): Promise<{ id: string; trainerStatus: TrainerStatus }> {
    await this.db.tx(async (client) => {
      const found = await client.query<{ status: ApplicationStatus; trainer_status: TrainerStatus | null }>(
        `select a.status, t.status as trainer_status from trainer_applications a left join trainers t on t.application_id = a.id where a.id = $1 for update of a`,
        [applicationId],
      );
      const row = found.rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 'Application not found.');
      if (row.status !== 'approved' || !row.trainer_status) throw new DomainError('INVALID_STATE', 'Only an approved trainer can be paused, suspended, revoked or resumed.');
      const gone = await client.query(`select 1 from trainer_applications a join users u on u.id = a.user_id where a.id = $1 and u.status = 'deleted'`, [applicationId]);
      if (gone.rows.length > 0) throw new DomainError('INVALID_STATE', 'This trainer deleted their account, so it cannot be changed.');
      if (row.trainer_status === target) throw new DomainError('INVALID_STATE', `This trainer is already ${target === 'active' ? 'active' : target}.`);
      await client.query(`update trainers set status = $2 where application_id = $1`, [applicationId, target]);
      const type = target === 'active' ? 'trainer_resumed' : `trainer_${target}`;
      await this.applications.event(client, applicationId, type, 'admin', adminId, reason ? { reason, from: row.trainer_status } : { from: row.trainer_status });
      await client.query(
        `insert into audit_log (id, actor_user_id, action, entity_type, entity_id, before, after) values ($1, $2, 'trainer.status_changed', 'trainer_application', $3, $4, $5)`,
        [uuidv7(), adminId, applicationId, JSON.stringify({ status: row.trainer_status }), JSON.stringify({ status: target, reason: reason ?? null })],
      );
    });
    return { id: applicationId, trainerStatus: target };
  }

  private async transition(
    adminId: string,
    applicationId: string,
    from: ApplicationStatus[],
    apply: (client: PoolClient, app: { userId: string }) => Promise<void>,
  ): Promise<{ id: string; status: ApplicationStatus }> {
    const status = await this.db.tx(async (client) => {
      const found = await client.query<{ user_id: string; status: ApplicationStatus }>(
        `select user_id, status from trainer_applications where id = $1 for update`,
        [applicationId],
      );
      const row = found.rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 'Application not found.');
      if (!from.includes(row.status)) throw new DomainError('INVALID_STATE', `This application is ${row.status.replace('_', ' ')}, so this action is not possible.`);
      await apply(client, { userId: row.user_id });
      const after = await client.query<{ status: ApplicationStatus }>(`select status from trainer_applications where id = $1`, [applicationId]);
      return after.rows[0]?.status ?? row.status;
    });
    return { id: applicationId, status };
  }
}
