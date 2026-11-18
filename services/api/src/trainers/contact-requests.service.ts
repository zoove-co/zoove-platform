import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { TrainerApplicationsService } from './trainer-applications.service';

export type ContactKind = 'email' | 'phone';
export type ContactStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

// What a trainer sees about their own requests.
export type MyContactRequest = { id: string; kind: ContactKind; newValue: string; status: ContactStatus; decisionNote: string | null; createdAt: string; decidedAt: string | null };
// What ops see: the trainer, what they have now, what they want, and why.
export type AdminContactRequest = MyContactRequest & { applicationId: string | null; trainerName: string; oldValue: string | null; reason: string | null; decidedByName: string | null };

type Row = { id: string; kind: ContactKind; new_value: string; status: ContactStatus; decision_note: string | null; created_at: Date; decided_at: Date | null };
const mine = (r: Row): MyContactRequest => ({ id: r.id, kind: r.kind, newValue: r.new_value, status: r.status, decisionNote: r.decision_note, createdAt: r.created_at.toISOString(), decidedAt: r.decided_at ? r.decided_at.toISOString() : null });

// A trainer cannot change their sign-in email or mobile themselves: the email is how they sign in, and both were checked when they were
// approved. They ask Zoove; a person there verifies the request (usually with a call) and approves or rejects it. Nothing changes before that.
@Injectable()
export class ContactRequestsService {
  constructor(private readonly db: DatabaseService, private readonly applications: TrainerApplicationsService) {}

  private async trainerApplication(userId: string): Promise<{ id: string; email: string | null; phone: string | null }> {
    const r = await this.db.query<{ id: string; email: string | null; phone_e164: string | null }>(
      `select a.id, coalesce(u.verified_email, a.email) as email, a.phone_e164 from trainer_applications a join users u on u.id = a.user_id
        where a.user_id = $1 and a.status = 'approved' and u.status = 'active'`, [userId]);
    const row = r.rows[0];
    if (!row) throw new DomainError('FORBIDDEN', 'Only approved Zoove trainers can ask for this.');
    return { id: row.id, email: row.email, phone: row.phone_e164 };
  }

  // The latest few, newest first: any open request and what was decided recently.
  async listMine(userId: string): Promise<MyContactRequest[]> {
    const r = await this.db.query<Row>(
      `select id, kind, new_value, status, decision_note, created_at, decided_at from trainer_contact_requests where user_id = $1 and status <> 'cancelled' order by created_at desc limit 6`, [userId]);
    return r.rows.map(mine);
  }

  async create(userId: string, kind: ContactKind, newValue: string, reason: string | undefined): Promise<MyContactRequest[]> {
    const current = await this.trainerApplication(userId);
    const value = kind === 'email' ? newValue.trim().toLowerCase() : newValue.trim();
    const old = kind === 'email' ? current.email : current.phone;
    if (old && old.toLowerCase() === value.toLowerCase()) throw new DomainError('INVALID_REQUEST', kind === 'email' ? 'That is already your email.' : 'That is already your mobile number.');
    if (kind === 'email') {
      const taken = await this.db.query(`select 1 from users where id <> $1 and (lower(verified_email) = $2 or lower(email) = $2)`, [userId, value]);
      if (taken.rows[0]) throw new DomainError('EMAIL_TAKEN', 'That email is already used by another Zoove account. Use a different one.');
    }
    try {
      await this.db.tx(async (client) => {
        const id = uuidv7();
        await client.query(`insert into trainer_contact_requests (id, user_id, kind, old_value, new_value, reason) values ($1, $2, $3, $4, $5, $6)`, [id, userId, kind, old, value, reason?.trim() || null]);
        await this.applications.event(client, current.id, 'contact_change_requested', 'trainer', userId, { kind });
        await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'trainer_contact_request', $2, 'trainer.contact_change_requested', $3)`, [
          uuidv7(), id, JSON.stringify({ requestId: id, applicationId: current.id, kind }),
        ]);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new DomainError('INVALID_STATE', 'You already have a request open for this. Wait for Zoove to reply, or cancel it first.');
      throw error;
    }
    return this.listMine(userId);
  }

  async cancel(userId: string, id: string): Promise<MyContactRequest[]> {
    const done = await this.db.query(`update trainer_contact_requests set status = 'cancelled', decided_at = now() where id = $1 and user_id = $2 and status = 'pending'`, [id, userId]);
    if (done.rowCount === 0) throw new DomainError('NOT_FOUND', 'That request is not open any more.');
    return this.listMine(userId);
  }

  // ---- Ops ----

  async listAdmin(status: ContactStatus | 'all', limit: number): Promise<{ pending: number; requests: AdminContactRequest[] }> {
    const r = await this.db.query<Row & { application_id: string | null; first_name: string | null; last_name: string | null; old_value: string | null; reason: string | null; decided_by_name: string | null }>(
      `select q.id, q.kind, q.new_value, q.old_value, q.reason, q.status, q.decision_note, q.created_at, q.decided_at, a.id as application_id, a.first_name, a.last_name,
              (select p.display_name from admin_profiles p where p.user_id = q.decided_by) as decided_by_name
         from trainer_contact_requests q left join trainer_applications a on a.user_id = q.user_id
        where ($1 = 'all' or q.status = $1) order by (q.status = 'pending') desc, q.created_at desc limit $2`, [status, limit]);
    const pending = (await this.db.query<{ n: string }>(`select count(*)::text as n from trainer_contact_requests where status = 'pending'`)).rows[0]?.n ?? '0';
    return {
      pending: Number(pending),
      requests: r.rows.map((row) => ({
        ...mine(row), applicationId: row.application_id, trainerName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Trainer', oldValue: row.old_value, reason: row.reason, decidedByName: row.decided_by_name,
      })),
    };
  }

  async decide(adminId: string, id: string, decision: 'approved' | 'rejected', note: string | undefined): Promise<AdminContactRequest> {
    await this.db.tx(async (client) => {
      const found = await client.query<{ user_id: string; kind: ContactKind; new_value: string; old_value: string | null; status: ContactStatus }>(
        `select user_id, kind, new_value, old_value, status from trainer_contact_requests where id = $1 for update`, [id]);
      const req = found.rows[0];
      if (!req) throw new DomainError('NOT_FOUND', 'Request not found.');
      if (req.status !== 'pending') throw new DomainError('INVALID_STATE', 'This request was already handled or cancelled.');
      const app = (await client.query<{ id: string }>(`select id from trainer_applications where user_id = $1 for update`, [req.user_id])).rows[0];
      if (!app) throw new DomainError('NOT_FOUND', 'The trainer was not found.');
      if (decision === 'approved') {
        if (req.kind === 'email') {
          const taken = await client.query(`select 1 from users where id <> $1 and (lower(verified_email) = $2 or lower(email) = $2)`, [req.user_id, req.new_value.toLowerCase()]);
          if (taken.rows[0]) throw new DomainError('EMAIL_TAKEN', 'That email is now used by another Zoove account, so it cannot be approved. Reject this request.');
          // The verified email is the sign-in identity: from now on the trainer signs in with the new address.
          await client.query(`update users set verified_email = $2, email = $2 where id = $1`, [req.user_id, req.new_value.toLowerCase()]);
          await client.query(`update trainer_applications set email = $2 where id = $1`, [app.id, req.new_value.toLowerCase()]);
        } else {
          await client.query(`update trainer_applications set phone_e164 = $2 where id = $1`, [app.id, req.new_value]);
          await client.query(`update users set contact_phone = $2 where id = $1`, [req.user_id, req.new_value]);
        }
      }
      await client.query(`update trainer_contact_requests set status = $2, decided_by = $3, decided_at = now(), decision_note = $4 where id = $1`, [id, decision, adminId, note?.trim() || null]);
      await this.applications.event(client, app.id, decision === 'approved' ? 'contact_change_approved' : 'contact_change_rejected', 'admin', adminId, { kind: req.kind });
      await client.query(
        `insert into audit_log (id, actor_user_id, action, entity_type, entity_id, before, after) values ($1, $2, $3, 'trainer_contact_request', $4, $5, $6)`,
        [uuidv7(), adminId, `trainer.contact_${decision === 'approved' ? 'approved' : 'rejected'}`, id, JSON.stringify({ [req.kind]: req.old_value }), JSON.stringify({ [req.kind]: req.new_value, note: note ?? null })],
      );
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'trainer_contact_request', $2, 'trainer.contact_change_decided', $3)`, [
        uuidv7(), id, JSON.stringify({ requestId: id, trainerId: req.user_id, kind: req.kind, decision, newValue: req.new_value, oldValue: req.old_value, note: note?.trim() || null }),
      ]);
    });
    const after = (await this.listAdmin('all', 200)).requests.find((r) => r.id === id);
    if (!after) throw new DomainError('NOT_FOUND', 'Request not found.');
    return after;
  }
}
