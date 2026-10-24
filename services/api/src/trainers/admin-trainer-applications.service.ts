import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { SIGNED_LINK_SECONDS } from './rules';
import { TrainerApplicationsService, type ApplicationStatus, type TrainerStatus } from './trainer-applications.service';

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
      `select a.id, a.first_name, a.last_name, coalesce(a.phone_e164, u.phone_e164) as phone_e164, a.email, a.status, a.specialties, a.experience_years, a.source, a.submitted_at, t.status as trainer_status
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
    return {
      ...view,
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
