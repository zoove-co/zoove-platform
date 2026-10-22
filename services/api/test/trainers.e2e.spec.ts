import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { EmailProvider, type EmailMessage } from '../src/email/email.provider';
import { OutboxWorkerService } from '../src/notifications/outbox-worker.service';
import { StorageService } from '../src/storage/storage.service';
import { CODE, startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const TRAINER = '+919811111111';
const ADMIN = '+919822222222';
const OTHER = '+919833333333';

class MemoryStorage extends StorageService {
  files = new Map<string, Buffer>();
  put(key: string, body: Buffer): Promise<void> {
    this.files.set(key, body);
    return Promise.resolve();
  }
  signedGetUrl(key: string): Promise<string> {
    return Promise.resolve(`https://files.test/${key}?sig=abc`);
  }
  remove(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}

class MemoryEmail extends EmailProvider {
  sent: EmailMessage[] = [];
  fail = false;
  send(message: EmailMessage): Promise<void> {
    if (this.fail) return Promise.reject(new Error('mail vendor down'));
    this.sent.push(message);
    return Promise.resolve();
  }
}

// Smallest valid-looking files: the API checks the first bytes.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 2)]);
const PDF = Buffer.from('%PDF-1.4\n' + 'x'.repeat(100));

const details = {
  firstName: 'Asha',
  lastName: 'Rao',
  dateOfBirth: '1994-05-12',
  gender: 'female',
  email: 'Asha@Example.com',
  addressLine: '12, Palm Residency',
  addressArea: 'Bandra West, Mumbai',
  addressPincode: '400050',
  specialties: ['yoga', 'pilates'],
  experienceYears: 6,
  languages: ['English', 'Hindi'],
  panNumber: 'abcde1234f',
  aadhaarLast4: '4321',
  source: 'akash',
};

suite('trainer onboarding', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const storage = new MemoryStorage();
  const mail = new MemoryEmail();
  let trainerToken: string;
  let adminToken: string;
  let otherToken: string;

  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(phone: string, audience: 'customer' | 'trainer' = 'trainer'): Promise<string> {
    await pool.query(`update otp_challenges set created_at = created_at - interval '2 minutes' where phone_e164 = $1`, [phone]);
    await http().post('/v1/auth/otp/request').send({ phone }).expect(200);
    const response = await http().post('/v1/auth/otp/verify').send({ phone, code: CODE, audience }).expect(200);
    return response.body.token as string;
  }

  const upload = (t: string, kind: string, file: Buffer, name = 'doc.jpg') =>
    http().post('/v1/trainer-application/documents').set(as(t)).field('kind', kind).attach('file', file, name);

  async function fillEverything(t: string) {
    await http().put('/v1/trainer-application').set(as(t)).send(details).expect(200);
    await upload(t, 'aadhaar_front', JPEG).expect(201);
    await upload(t, 'aadhaar_back', JPEG).expect(201);
    await upload(t, 'pan_card', PNG, 'pan.png').expect(201);
    await upload(t, 'selfie', JPEG, 'me.jpg').expect(201);
  }

  const drain = async () => {
    const worker = app.get(OutboxWorkerService);
    let handled = 0;
    for (let i = 0; i < 5; i += 1) handled += await worker.runOnce();
    return handled;
  };

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) =>
      builder.overrideProvider(StorageService).useValue(storage).overrideProvider(EmailProvider).useValue(mail),
    ));
    await pool.query('truncate table trainer_application_events, trainer_documents, trainers, trainer_applications, outbox_events, audit_log restart identity cascade');
    await pool.query(`delete from user_roles where role in ('trainer', 'admin')`);
    await pool.query('delete from consents');
    trainerToken = await login(TRAINER);
    otherToken = await login(OTHER);
    adminToken = await login(ADMIN, 'customer');
    await pool.query(`insert into user_roles (user_id, role) select id, 'admin' from users where phone_e164 = $1 on conflict do nothing`, [ADMIN]);
    adminToken = await login(ADMIN, 'customer'); // sign in again so the token carries the admin role
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('signing in as a trainer applicant does not create a customer account', async () => {
    const roles = await pool.query(`select r.role from user_roles r join users u on u.id = r.user_id where u.phone_e164 = $1`, [TRAINER]);
    expect(roles.rows).toEqual([]);
  });

  it('starts empty and lists everything that is missing', async () => {
    const r = await http().get('/v1/trainer-application').set(as(trainerToken)).expect(200);
    expect(r.body.status).toBe('none');
    expect(r.body.canSubmit).toBe(false);
    expect(r.body.missing).toEqual(expect.arrayContaining(['firstName', 'panNumber', 'document:selfie']));
  });

  it('needs sign in', async () => {
    await http().get('/v1/trainer-application').expect(401);
    await http().get('/v1/admin/trainer-applications').expect(401);
  });

  it('saves details partially, cleans values, and never returns the full PAN or Aadhaar', async () => {
    const r = await http().put('/v1/trainer-application').set(as(trainerToken)).send(details).expect(200);
    expect(r.body.status).toBe('draft');
    expect(r.body.form.email).toBe('asha@example.com');
    expect(r.body.form.panLast4).toBe('234F');
    expect(r.body.form.aadhaarLast4).toBe('4321');
    expect(JSON.stringify(r.body)).not.toContain('ABCDE1234F');
    const stored = await pool.query(`select pan_encrypted, pan_hash from trainer_applications`);
    expect(stored.rows[0].pan_encrypted).not.toContain('ABCDE');
    expect(stored.rows[0].pan_hash).toHaveLength(64);
    // A later partial save changes only what was sent.
    const again = await http().put('/v1/trainer-application').set(as(trainerToken)).send({ experienceYears: 7 }).expect(200);
    expect(again.body.form.experienceYears).toBe(7);
    expect(again.body.form.firstName).toBe('Asha');
  });

  it('rejects bad values with clear errors', async () => {
    const bad = (body: object) => http().put('/v1/trainer-application').set(as(trainerToken)).send(body);
    expect((await bad({ panNumber: '12345' })).body.error.code).toBe('INVALID_REQUEST');
    expect((await bad({ aadhaarLast4: '123456789012' })).body.error.code).toBe('INVALID_REQUEST');
    expect((await bad({ dateOfBirth: '2015-01-01' })).body.error.details.issues[0].path).toBe('dateOfBirth');
    expect((await bad({ specialties: ['karate'] })).body.error.code).toBe('INVALID_REQUEST');
    expect((await bad({ unknownField: 1 })).body.error.code).toBe('INVALID_REQUEST');
  });

  it('does not let the same PAN be used by two applicants', async () => {
    await http().put('/v1/trainer-application').set(as(otherToken)).send({ panNumber: 'ABCDE1234F' }).expect(400);
  });

  it('accepts real files only', async () => {
    await upload(trainerToken, 'aadhaar_front', JPEG).expect(201);
    const fake = await upload(trainerToken, 'pan_card', Buffer.from('<html>not an image</html>'), 'pan.jpg').expect(422);
    expect(fake.body.error.code).toBe('FILE_INVALID');
    const pdfSelfie = await upload(trainerToken, 'selfie', PDF, 'me.pdf').expect(422);
    expect(pdfSelfie.body.error.code).toBe('FILE_INVALID');
    await http().post('/v1/trainer-application/documents').set(as(trainerToken)).field('kind', 'pan_card').expect(422);
    await http().post('/v1/trainer-application/documents').set(as(trainerToken)).field('kind', 'passport').attach('file', JPEG, 'a.jpg').expect(400);
  });

  it('replaces a document when the same kind is uploaded again, and deletes the old file', async () => {
    const before = [...storage.files.keys()].filter((k) => k.includes('aadhaar_front'));
    expect(before).toHaveLength(1);
    const r = await upload(trainerToken, 'aadhaar_front', PNG, 'new.png').expect(201);
    expect(r.body.documents.filter((d: { kind: string }) => d.kind === 'aadhaar_front')).toHaveLength(1);
    const after = [...storage.files.keys()].filter((k) => k.includes('aadhaar_front'));
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before[0]);
  });

  it('will not submit until everything is there, and says what is missing', async () => {
    const r = await http().post('/v1/trainer-application/submit').set(as(trainerToken)).send({ agree: true }).expect(422);
    expect(r.body.error.code).toBe('APPLICATION_INCOMPLETE');
    expect(r.body.error.details.missing).toEqual(expect.arrayContaining(['document:aadhaar_back', 'document:pan_card', 'document:selfie']));
  });

  it('submits once complete, and needs agreement to the terms', async () => {
    await upload(trainerToken, 'aadhaar_back', JPEG).expect(201);
    await upload(trainerToken, 'pan_card', PNG, 'pan.png').expect(201);
    await upload(trainerToken, 'selfie', JPEG, 'me.jpg').expect(201);
    await upload(trainerToken, 'certificate', PDF, 'cert.pdf').expect(201);
    const view = await http().get('/v1/trainer-application').set(as(trainerToken)).expect(200);
    expect(view.body.canSubmit).toBe(true);

    await http().post('/v1/trainer-application/submit').set(as(trainerToken)).send({ agree: false }).expect(400);
    const r = await http().post('/v1/trainer-application/submit').set(as(trainerToken)).send({ agree: true }).expect(200);
    expect(r.body.status).toBe('submitted');
    expect(r.body.canEdit).toBe(false);
    const consents = await pool.query(`select kind from consents c join users u on u.id = c.user_id where u.phone_e164 = $1 order by kind`, [TRAINER]);
    expect(consents.rows.map((c) => c.kind)).toEqual(['privacy', 'terms']);
    // Locked now.
    await http().put('/v1/trainer-application').set(as(trainerToken)).send({ experienceYears: 9 }).expect(409);
    await upload(trainerToken, 'selfie', JPEG).expect(409);
    await http().post('/v1/trainer-application/submit').set(as(trainerToken)).send({ agree: true }).expect(409);
  });

  it('emails the trainer and the team after submitting', async () => {
    process.env.OPS_NOTIFY_EMAILS = '';
    expect(await drain()).toBeGreaterThanOrEqual(1);
    const toTrainer = mail.sent.find((m) => m.to === 'asha@example.com');
    expect(toTrainer?.subject).toContain('received');
    expect(toTrainer?.html).toContain('Hi Asha');
  });

  it('keeps admin tools away from non-admins', async () => {
    await http().get('/v1/admin/trainer-applications').set(as(trainerToken)).expect(403);
    await http().get('/v1/admin/trainer-applications').set(as(otherToken)).expect(403);
  });

  let applicationId: string;
  it('shows the admin the pending list with counts', async () => {
    const r = await http().get('/v1/admin/trainer-applications?status=pending').set(as(adminToken)).expect(200);
    expect(r.body.counts.submitted).toBe(1);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0]).toMatchObject({ name: 'Asha Rao', phone: TRAINER, status: 'submitted', source: 'akash' });
    applicationId = r.body.items[0].id;
    const search = await http().get('/v1/admin/trainer-applications?search=rao').set(as(adminToken)).expect(200);
    expect(search.body.items).toHaveLength(1);
    const none = await http().get('/v1/admin/trainer-applications?search=zzz').set(as(adminToken)).expect(200);
    expect(none.body.items).toHaveLength(0);
  });

  let documentIds: Record<string, string> = {};
  it('shows full detail, and gives a private link for each document, recording every view', async () => {
    const d = await http().get(`/v1/admin/trainer-applications/${applicationId}`).set(as(adminToken)).expect(200);
    expect(d.body.phone).toBe(TRAINER);
    expect(d.body.form.panLast4).toBe('234F');
    expect(d.body.events.map((e: { type: string }) => e.type)).toContain('submitted');
    documentIds = Object.fromEntries(d.body.documents.map((x: { kind: string; id: string }) => [x.kind, x.id]));
    const link = await http().get(`/v1/admin/trainer-applications/${applicationId}/documents/${documentIds.selfie}/url`).set(as(adminToken)).expect(200);
    expect(link.body.url).toContain('https://files.test/');
    expect(link.body.expiresInSeconds).toBe(300);
    const audit = await pool.query(`select action from audit_log where entity_id = $1`, [documentIds.selfie]);
    expect(audit.rows).toHaveLength(1);
    await http().get(`/v1/admin/trainer-applications/${applicationId}/documents/00000000-0000-4000-8000-000000000000/url`).set(as(adminToken)).expect(404);
  });

  it('asks for changes: marks the document, emails the trainer, and unlocks editing', async () => {
    await http().post(`/v1/admin/trainer-applications/${applicationId}/start-review`).set(as(adminToken)).expect(200);
    const r = await http()
      .post(`/v1/admin/trainer-applications/${applicationId}/request-changes`)
      .set(as(adminToken))
      .send({ note: 'The PAN photo is blurry. Please upload a clear one.', documentIds: [documentIds.pan_card] })
      .expect(200);
    expect(r.body.status).toBe('changes_requested');

    mail.sent = [];
    await drain();
    const email = mail.sent.find((m) => m.to === 'asha@example.com');
    expect(email?.subject).toContain('Action needed');
    expect(email?.text).toContain('PAN photo is blurry');

    const view = await http().get('/v1/trainer-application').set(as(trainerToken)).expect(200);
    expect(view.body.status).toBe('changes_requested');
    expect(view.body.canEdit).toBe(true);
    expect(view.body.canSubmit).toBe(false);
    expect(view.body.missing).toContain('document:pan_card');
    expect(view.body.reviewNote).toContain('blurry');
    expect(view.body.documents.find((x: { kind: string }) => x.kind === 'pan_card').status).toBe('rejected');
  });

  it('lets the trainer fix it and resubmit', async () => {
    await upload(trainerToken, 'pan_card', JPEG, 'pan2.jpg').expect(201);
    const r = await http().post('/v1/trainer-application/submit').set(as(trainerToken)).send({ agree: true }).expect(200);
    expect(r.body.status).toBe('submitted');
    mail.sent = [];
    await drain();
    expect(mail.sent.find((m) => m.to === 'asha@example.com')?.subject).toContain('updates');
  });

  it('approves: creates the trainer, grants the role, emails, and blocks a second decision', async () => {
    await http().post(`/v1/admin/trainer-applications/${applicationId}/approve`).set(as(adminToken)).send({}).expect(200);
    const trainers = await pool.query(`select t.status from trainers t join users u on u.id = t.user_id where u.phone_e164 = $1`, [TRAINER]);
    expect(trainers.rows).toEqual([{ status: 'active' }]);
    const roles = await pool.query(`select r.role from user_roles r join users u on u.id = r.user_id where u.phone_e164 = $1`, [TRAINER]);
    expect(roles.rows).toEqual([{ role: 'trainer' }]);
    const docs = await pool.query(`select distinct status from trainer_documents where status <> 'replaced'`);
    expect(docs.rows).toEqual([{ status: 'accepted' }]);

    await http().post(`/v1/admin/trainer-applications/${applicationId}/reject`).set(as(adminToken)).send({ reason: 'changed my mind' }).expect(409);
    await http().post(`/v1/admin/trainer-applications/${applicationId}/approve`).set(as(adminToken)).send({}).expect(409);

    mail.sent = [];
    await drain();
    expect(mail.sent.find((m) => m.to === 'asha@example.com')?.subject).toContain('approved');
    const mine = await http().get('/v1/trainer-application').set(as(trainerToken)).expect(200);
    expect(mine.body.status).toBe('approved');
  });

  it('rejects an application with a reason and emails it', async () => {
    const t = await login(OTHER);
    await http().put('/v1/trainer-application').set(as(t)).send({ ...details, email: 'other@example.com', panNumber: 'ZZZZZ9999Z' }).expect(200);
    await upload(t, 'aadhaar_front', JPEG).expect(201);
    await upload(t, 'aadhaar_back', JPEG).expect(201);
    await upload(t, 'pan_card', JPEG).expect(201);
    await upload(t, 'selfie', JPEG).expect(201);
    await http().post('/v1/trainer-application/submit').set(as(t)).send({ agree: true }).expect(200);
    const list = await http().get('/v1/admin/trainer-applications?status=submitted').set(as(adminToken)).expect(200);
    const id = list.body.items[0].id as string;
    await http().post(`/v1/admin/trainer-applications/${id}/reject`).set(as(adminToken)).send({ reason: 'x' }).expect(400);
    await http().post(`/v1/admin/trainer-applications/${id}/reject`).set(as(adminToken)).send({ reason: 'Documents do not match.' }).expect(200);
    mail.sent = [];
    await drain();
    // The "received" mail and the rejection mail may arrive in the same batch.
    const email = mail.sent.find((m) => m.to === 'other@example.com' && m.text.includes('Documents do not match.'));
    expect(email?.subject).toBe('Your Zoove trainer application');
  });

  it('retries a failed email later instead of losing it', async () => {
    await pool.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type) values (gen_random_uuid(), 'trainer_application', $1, 'trainer.application_approved')`, [applicationId]);
    mail.fail = true;
    mail.sent = [];
    await drain();
    const row = await pool.query(`select attempts, last_error, published_at, next_attempt_at > now() as waiting from outbox_events where published_at is null`);
    expect(row.rows[0]).toMatchObject({ attempts: 1, waiting: true });
    expect(row.rows[0].last_error).toContain('mail vendor down');
    // Not retried before its time.
    await drain();
    expect((await pool.query(`select attempts from outbox_events where published_at is null`)).rows[0].attempts).toBe(1);
    mail.fail = false;
    await pool.query(`update outbox_events set next_attempt_at = now() where published_at is null`);
    await drain();
    expect((await pool.query(`select count(*)::int n from outbox_events where published_at is null and event_type like 'trainer.%'`)).rows[0].n).toBe(0);
    expect(mail.sent).toHaveLength(1);
  });
});
