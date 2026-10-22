import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { lockFor } from '../common/locks';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { PiiService } from './pii.service';
import {
  CONSENT_VERSION,
  MAX_EXTRA_DOCUMENTS,
  MAX_FILE_BYTES,
  MIN_AGE_YEARS,
  REQUIRED_DOCUMENT_KINDS,
  SIGNED_LINK_SECONDS,
  SINGLE_DOCUMENT_KINDS,
  ageOn,
  sniffFile,
  type DocumentKind,
} from './rules';

export type ApplicationStatus = 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected';

export type ApplicationForm = {
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  addressArea: string | null;
  addressCity: string;
  addressPincode: string | null;
  specialties: string[];
  experienceYears: number | null;
  languages: string[];
  bio: string | null;
  panLast4: string | null;
  aadhaarLast4: string | null;
};

export type ApplicationDocument = {
  id: string;
  kind: DocumentKind;
  status: 'uploaded' | 'accepted' | 'rejected';
  note: string | null;
  mimeType: string;
  uploadedAt: string;
};

export type ApplicationView = {
  id: string | null;
  status: ApplicationStatus | 'none';
  form: ApplicationForm;
  documents: ApplicationDocument[];
  missing: string[];
  canEdit: boolean;
  canSubmit: boolean;
  reviewNote: string | null;
  submittedAt: string | null;
};

export type SaveInput = {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  email?: string;
  phone?: string;
  addressLine?: string;
  addressArea?: string;
  addressPincode?: string;
  specialties?: string[];
  experienceYears?: number;
  languages?: string[];
  bio?: string;
  panNumber?: string;
  aadhaarLast4?: string;
  source?: string;
};

type AppRow = {
  id: string;
  status: ApplicationStatus;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  email: string | null;
  phone_e164: string | null;
  address_line: string | null;
  address_area: string | null;
  address_city: string;
  address_pincode: string | null;
  specialties: string[];
  experience_years: number | null;
  languages: string[];
  bio: string | null;
  pan_last4: string | null;
  pan_hash: string | null;
  aadhaar_last4: string | null;
  review_note: string | null;
  submitted_at: Date | null;
};

type DocRow = { id: string; kind: DocumentKind; status: 'uploaded' | 'accepted' | 'rejected'; reviewer_note: string | null; mime_type: string; uploaded_at: Date };

const APP_COLUMNS = `id, status, first_name, last_name, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, gender, email, phone_e164,
  address_line, address_area, address_city, address_pincode, specialties, experience_years, languages, bio,
  pan_last4, pan_hash, aadhaar_last4, review_note, submitted_at`;

const EDITABLE: ApplicationStatus[] = ['draft', 'changes_requested'];

const emptyForm = (): ApplicationForm => ({
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  gender: null,
  email: null,
  phone: null,
  addressLine: null,
  addressArea: null,
  addressCity: 'Mumbai',
  addressPincode: null,
  specialties: [],
  experienceYears: null,
  languages: [],
  bio: null,
  panLast4: null,
  aadhaarLast4: null,
});

@Injectable()
export class TrainerApplicationsService {
  private readonly logger = new Logger('TrainerApplications');

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly pii: PiiService,
  ) {}

  async get(userId: string): Promise<ApplicationView> {
    const found = await this.db.query<AppRow>(`select ${APP_COLUMNS} from trainer_applications where user_id = $1`, [userId]);
    const row = found.rows[0];
    if (!row) {
      // Nothing saved yet: show the email they signed in with, so the form starts with it filled in.
      const who = await this.db.query<{ verified_email: string | null }>(`select verified_email from users where id = $1`, [userId]);
      return { id: null, status: 'none', form: { ...emptyForm(), email: who.rows[0]?.verified_email ?? null }, documents: [], missing: this.missingFor(null, []), canEdit: true, canSubmit: false, reviewNote: null, submittedAt: null };
    }
    const docs = await this.db.query<DocRow>(
      `select id, kind, status, reviewer_note, mime_type, uploaded_at from trainer_documents
        where application_id = $1 and status <> 'replaced' order by uploaded_at`,
      [row.id],
    );
    return this.view(row, docs.rows);
  }

  async save(userId: string, input: SaveInput): Promise<ApplicationView> {
    if (input.dateOfBirth !== undefined && ageOn(input.dateOfBirth, new Date()) < MIN_AGE_YEARS) {
      throw new DomainError('INVALID_REQUEST', `Trainers must be at least ${MIN_AGE_YEARS} years old.`, { issues: [{ path: 'dateOfBirth', message: `Must be at least ${MIN_AGE_YEARS} years old` }] });
    }
    if (input.specialties !== undefined) await this.assertKnownServices(input.specialties);

    try {
      await this.db.tx(async (client) => {
        const app = await this.ensure(client, userId);
        if (!EDITABLE.includes(app.status)) throw new DomainError('INVALID_STATE', 'This application can no longer be edited.');

        const sets: string[] = [];
        const params: unknown[] = [app.id];
        const add = (column: string, value: unknown) => {
          params.push(value);
          sets.push(`${column} = $${params.length}`);
        };
        if (input.firstName !== undefined) add('first_name', input.firstName);
        if (input.lastName !== undefined) add('last_name', input.lastName);
        if (input.dateOfBirth !== undefined) add('date_of_birth', input.dateOfBirth);
        if (input.gender !== undefined) add('gender', input.gender);
        if (input.email !== undefined) add('email', input.email.toLowerCase());
        if (input.phone !== undefined) add('phone_e164', input.phone);
        if (input.addressLine !== undefined) add('address_line', input.addressLine);
        if (input.addressArea !== undefined) add('address_area', input.addressArea);
        if (input.addressPincode !== undefined) add('address_pincode', input.addressPincode);
        if (input.specialties !== undefined) add('specialties', input.specialties);
        if (input.experienceYears !== undefined) add('experience_years', input.experienceYears);
        if (input.languages !== undefined) add('languages', input.languages);
        if (input.bio !== undefined) add('bio', input.bio || null);
        if (input.aadhaarLast4 !== undefined) add('aadhaar_last4', input.aadhaarLast4);
        if (input.source !== undefined) add('source', input.source);
        if (input.panNumber !== undefined) {
          add('pan_encrypted', this.pii.encrypt(input.panNumber));
          add('pan_last4', input.panNumber.slice(-4));
          add('pan_hash', this.pii.fingerprint(input.panNumber));
        }
        if (sets.length > 0) await client.query(`update trainer_applications set ${sets.join(', ')} where id = $1`, params);
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string; constraint?: string }).constraint === 'trainer_applications_pan_hash_key') {
        throw new DomainError('INVALID_REQUEST', 'This PAN is already registered with another application.', { issues: [{ path: 'panNumber', message: 'Already registered' }] });
      }
      throw error;
    }
    return this.get(userId);
  }

  async upload(userId: string, kind: DocumentKind, file: { buffer: Buffer; size: number } | undefined): Promise<ApplicationView> {
    if (!file || file.size === 0) throw new DomainError('FILE_INVALID', 'Choose a file to upload.');
    if (file.size > MAX_FILE_BYTES) throw new DomainError('FILE_INVALID', 'The file is too large. The limit is 8 MB.');
    const sniffed = sniffFile(file.buffer);
    if (!sniffed) throw new DomainError('FILE_INVALID', 'Upload a JPG, PNG, WebP or PDF file.');
    if (kind === 'selfie' && sniffed.mime === 'application/pdf') throw new DomainError('FILE_INVALID', 'The selfie must be a photo.');

    const current = await this.db.query<{ id: string; status: ApplicationStatus }>(`select id, status from trainer_applications where user_id = $1`, [userId]);
    const existing = current.rows[0];
    if (existing && !EDITABLE.includes(existing.status)) throw new DomainError('INVALID_STATE', 'This application can no longer be edited.');

    const application = existing ?? (await this.db.tx((client) => this.ensure(client, userId)));
    const documentId = uuidv7();
    const key = `trainers/${application.id}/${kind}-${documentId}.${sniffed.ext}`;

    // File first, row second: a failed upload never leaves a row pointing at nothing.
    await this.storage.put(key, file.buffer, sniffed.mime);

    let replacedKey: string | null = null;
    try {
      replacedKey = await this.db.tx(async (client) => {
        const app = await client.query<{ status: ApplicationStatus }>(`select status from trainer_applications where id = $1 for update`, [application.id]);
        if (!app.rows[0] || !EDITABLE.includes(app.rows[0].status)) throw new DomainError('INVALID_STATE', 'This application can no longer be edited.');
        let old: string | null = null;
        if ((SINGLE_DOCUMENT_KINDS as readonly string[]).includes(kind)) {
          const replaced = await client.query<{ storage_key: string }>(
            `update trainer_documents set status = 'replaced' where application_id = $1 and kind = $2 and status <> 'replaced' returning storage_key`,
            [application.id, kind],
          );
          old = replaced.rows[0]?.storage_key ?? null;
        } else {
          const count = await client.query<{ n: string }>(
            `select count(*) n from trainer_documents where application_id = $1 and kind in ('certificate', 'other') and status <> 'replaced'`,
            [application.id],
          );
          if (Number(count.rows[0]?.n ?? 0) >= MAX_EXTRA_DOCUMENTS) throw new DomainError('FILE_INVALID', `You can upload up to ${MAX_EXTRA_DOCUMENTS} extra documents.`);
        }
        await client.query(
          `insert into trainer_documents (id, application_id, kind, storage_key, mime_type, size_bytes) values ($1, $2, $3, $4, $5, $6)`,
          [documentId, application.id, kind, key, sniffed.mime, file.size],
        );
        await this.event(client, application.id, 'document_uploaded', 'trainer', userId, { kind, documentId });
        return old;
      });
    } catch (error) {
      await this.storage.remove(key).catch(() => undefined);
      throw error;
    }
    if (replacedKey) await this.storage.remove(replacedKey).catch((error: unknown) => this.logger.warn(`Could not remove old file: ${String(error)}`));
    return this.get(userId);
  }

  async removeDocument(userId: string, documentId: string): Promise<ApplicationView> {
    const key = await this.db.tx(async (client) => {
      const found = await client.query<{ id: string; storage_key: string; status: ApplicationStatus; kind: DocumentKind }>(
        `select d.id, d.storage_key, a.status, d.kind from trainer_documents d join trainer_applications a on a.id = d.application_id
          where d.id = $1 and a.user_id = $2 and d.status <> 'replaced' for update of a`,
        [documentId, userId],
      );
      const row = found.rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 'Document not found.');
      if (!EDITABLE.includes(row.status)) throw new DomainError('INVALID_STATE', 'This application can no longer be edited.');
      if (!['certificate', 'other'].includes(row.kind)) throw new DomainError('INVALID_REQUEST', 'Upload a new file to replace this document.');
      await client.query(`delete from trainer_documents where id = $1`, [documentId]);
      return row.storage_key;
    });
    await this.storage.remove(key).catch(() => undefined);
    return this.get(userId);
  }

  async submit(userId: string, ip: string | null): Promise<ApplicationView> {
    await this.db.tx(async (client) => {
      const found = await client.query<AppRow>(`select ${APP_COLUMNS} from trainer_applications where user_id = $1 for update`, [userId]);
      const row = found.rows[0];
      if (!row) throw new DomainError('APPLICATION_INCOMPLETE', 'Fill in your details first.', { missing: this.missingFor(null, []) });
      if (!EDITABLE.includes(row.status)) throw new DomainError('INVALID_STATE', 'This application was already submitted.');
      const docs = await client.query<DocRow>(
        `select id, kind, status, reviewer_note, mime_type, uploaded_at from trainer_documents where application_id = $1 and status <> 'replaced'`,
        [row.id],
      );
      const missing = this.missingFor(row, docs.rows);
      if (missing.length > 0) throw new DomainError('APPLICATION_INCOMPLETE', 'Some details or documents are still missing.', { missing });

      const resubmission = row.status === 'changes_requested';
      await client.query(
        `update trainer_applications set status = 'submitted', submitted_at = now(), consent_version = $2, consented_at = now(), review_note = null where id = $1`,
        [row.id, CONSENT_VERSION],
      );
      for (const kind of ['terms', 'privacy']) {
        await client.query(`insert into consents (id, user_id, kind, version, accepted, ip) values ($1, $2, $3, $4, true, $5)`, [uuidv7(), userId, kind, CONSENT_VERSION, ip]);
      }
      await this.event(client, row.id, resubmission ? 'resubmitted' : 'submitted', 'trainer', userId, {});
      await this.publish(client, row.id, 'trainer.application_submitted', { resubmission });
    });
    return this.get(userId);
  }

  // ---- helpers shared with the admin service ----

  async ensure(client: PoolClient, userId: string): Promise<{ id: string; status: ApplicationStatus }> {
    await lockFor(client, 'trainer-application', userId);
    const existing = await client.query<{ id: string; status: ApplicationStatus }>(`select id, status from trainer_applications where user_id = $1`, [userId]);
    if (existing.rows[0]) return existing.rows[0];
    const id = uuidv7();
    // Start with what the sign-in already proved: the verified email, or the phone for SMS sign-in.
    await client.query(
      `insert into trainer_applications (id, user_id, email, phone_e164)
       select $1, u.id, u.verified_email, case when u.phone_e164 ~ '^\\+91[6-9][0-9]{9}$' then u.phone_e164 end from users u where u.id = $2`,
      [id, userId],
    );
    await this.event(client, id, 'created', 'trainer', userId, {});
    return { id, status: 'draft' };
  }

  async event(client: PoolClient, applicationId: string, type: string, actor: 'trainer' | 'admin' | 'system', actorUserId: string | null, payload: object): Promise<void> {
    await client.query(
      `insert into trainer_application_events (id, application_id, type, actor, actor_user_id, payload) values ($1, $2, $3, $4, $5, $6)`,
      [uuidv7(), applicationId, type, actor, actorUserId, JSON.stringify(payload)],
    );
  }

  async publish(client: PoolClient, applicationId: string, eventType: string, payload: object): Promise<void> {
    await client.query(
      `insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'trainer_application', $2, $3, $4)`,
      [uuidv7(), applicationId, eventType, JSON.stringify(payload)],
    );
  }

  signedUrl(key: string): Promise<string> {
    return this.storage.signedGetUrl(key, SIGNED_LINK_SECONDS);
  }

  private async assertKnownServices(slugs: string[]): Promise<void> {
    if (slugs.length === 0) return;
    const known = await this.db.query<{ slug: string }>(`select slug from services where is_active and slug = any($1)`, [slugs]);
    const ok = new Set(known.rows.map((row) => row.slug));
    const unknown = slugs.filter((slug) => !ok.has(slug));
    if (unknown.length > 0) throw new DomainError('INVALID_REQUEST', 'Some specialties are not offered.', { issues: [{ path: 'specialties', message: `Unknown: ${unknown.join(', ')}` }] });
  }

  private missingFor(row: AppRow | null, docs: DocRow[]): string[] {
    const missing: string[] = [];
    const need = (name: string, ok: boolean) => {
      if (!ok) missing.push(name);
    };
    need('firstName', Boolean(row?.first_name));
    need('lastName', Boolean(row?.last_name));
    need('dateOfBirth', Boolean(row?.date_of_birth));
    need('gender', Boolean(row?.gender));
    need('email', Boolean(row?.email));
    need('phone', Boolean(row?.phone_e164));
    need('addressLine', Boolean(row?.address_line));
    need('addressArea', Boolean(row?.address_area));
    need('addressPincode', Boolean(row?.address_pincode));
    need('specialties', (row?.specialties.length ?? 0) > 0);
    need('experienceYears', row?.experience_years !== null && row?.experience_years !== undefined);
    need('panNumber', Boolean(row?.pan_hash));
    need('aadhaarLast4', Boolean(row?.aadhaar_last4));
    for (const kind of REQUIRED_DOCUMENT_KINDS) {
      // A rejected document has to be uploaded again before the application can go back for review.
      need(`document:${kind}`, docs.some((doc) => doc.kind === kind && doc.status !== 'rejected'));
    }
    return missing;
  }

  private view(row: AppRow, docs: DocRow[]): ApplicationView {
    const missing = this.missingFor(row, docs);
    const canEdit = EDITABLE.includes(row.status);
    return {
      id: row.id,
      status: row.status,
      form: {
        firstName: row.first_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        gender: row.gender,
        email: row.email,
        phone: row.phone_e164,
        addressLine: row.address_line,
        addressArea: row.address_area,
        addressCity: row.address_city,
        addressPincode: row.address_pincode,
        specialties: row.specialties,
        experienceYears: row.experience_years,
        languages: row.languages,
        bio: row.bio,
        panLast4: row.pan_last4,
        aadhaarLast4: row.aadhaar_last4,
      },
      documents: docs.map((doc) => ({ id: doc.id, kind: doc.kind, status: doc.status, note: doc.reviewer_note, mimeType: doc.mime_type, uploadedAt: doc.uploaded_at.toISOString() })),
      missing,
      canEdit,
      canSubmit: canEdit && missing.length === 0,
      reviewNote: row.review_note,
      submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
    };
  }
}
