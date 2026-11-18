import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { EmailProvider, type EmailMessage } from '../src/email/email.provider';
import { OutboxWorkerService } from '../src/notifications/outbox-worker.service';
import { CODE, signIn, startApp } from './helpers';

class MemoryEmail extends EmailProvider {
  sent: EmailMessage[] = [];
  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}
const mail = new MemoryEmail();
process.env.OPS_NOTIFY_EMAILS = 'ops@zoove.test';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const OWNER = 'owner-contact@zoove.test';
const VIEWER = 'viewer-contact@zoove.test';
const T1 = '+919800000011';
const OTHER = '+919800000012';

suite('trainer asks Zoove to change their email or mobile', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let owner: string;
  let viewer: string;
  let trainerToken: string;
  let trainerId: string;
  let applicationId: string;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const worker = () => app.get(OutboxWorkerService);
  async function admin(email: string, owner: boolean, permissions: string[]) {
    const user = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [email]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [user.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner, permissions) values ($1, 'Ops', 'Team', $2, $3)`, [user.rows[0]!.id, owner, permissions]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    return (await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  }
  const ask = (body: object) => http().post('/v1/trainer/contact-requests').set(as(trainerToken)).send(body);
  const pendingId = async () => (await pool.query<{ id: string }>(`select id from trainer_contact_requests where status = 'pending' limit 1`)).rows[0]!.id;
  const row = async () => (await pool.query<{ verified_email: string; email: string | null; contact_phone: string | null; app_email: string; app_phone: string }>(
    `select u.verified_email, u.email, u.contact_phone, a.email as app_email, a.phone_e164 as app_phone from users u join trainer_applications a on a.user_id = u.id where u.id = $1`, [trainerId])).rows[0]!;

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) => builder.overrideProvider(EmailProvider).useValue(mail)));
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query('truncate table booking_events, bookings, trainers, trainer_application_events, trainer_documents, trainer_applications, otp_challenges, refresh_tokens, admin_profiles, user_roles, users, outbox_events, audit_log cascade');
    owner = await admin(OWNER, true, []);
    viewer = await admin(VIEWER, false, ['trainers.view']);
    trainerToken = await signIn(app, pool, T1);
    trainerId = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [T1])).rows[0]!.id;
    await pool.query(`update users set verified_email = 'asha@trainer.test', email = 'asha@trainer.test' where id = $1`, [trainerId]);
    applicationId = (await pool.query<{ id: string }>(
      `insert into trainer_applications (id, user_id, status, first_name, last_name, email, phone_e164) values (gen_random_uuid(), $1, 'approved', 'Asha', 'Rao', 'asha@trainer.test', '+919811111111') returning id`, [trainerId])).rows[0]!.id;
    await pool.query(`insert into trainers (user_id, application_id) values ($1, $2)`, [trainerId, applicationId]);
    mail.sent.length = 0;
  });

  it('changes nothing until the team approves, then the email becomes the sign-in and both addresses are told', async () => {
    const sent = await ask({ kind: 'email', value: 'Asha.New@Trainer.test', reason: 'Old inbox is full' }).expect(200);
    expect(sent.body).toHaveLength(1);
    expect(sent.body[0]).toMatchObject({ kind: 'email', newValue: 'asha.new@trainer.test', status: 'pending' });
    expect((await row()).verified_email).toBe('asha@trainer.test');

    // The team is emailed, and it shows up in the admin list and in "needs attention".
    await worker().runOnce();
    expect(mail.sent.some((m) => m.to === 'ops@zoove.test' && /Asha Rao/.test(m.subject))).toBe(true);
    const list = (await http().get('/v1/admin/trainer-contact-requests').set(as(viewer)).expect(200)).body;
    expect(list.pending).toBe(1);
    expect(list.requests[0]).toMatchObject({ trainerName: 'Asha Rao', oldValue: 'asha@trainer.test', newValue: 'asha.new@trainer.test', reason: 'Old inbox is full', status: 'pending' });
    const attention = (await http().get('/v1/admin/attention').set(as(viewer)).expect(200)).body as { groups: { key: string; items: unknown[] }[] };
    expect(attention.groups.find((g) => g.key === 'trainer_requests')?.items).toHaveLength(1);

    const id = await pendingId();
    // Someone who can only view trainers cannot decide.
    await http().post(`/v1/admin/trainer-contact-requests/${id}/approve`).set(as(viewer)).send({}).expect(403);
    await http().post(`/v1/admin/trainer-contact-requests/${id}/approve`).set(as(owner)).send({ note: 'Called, confirmed' }).expect(200);
    const after = await row();
    expect(after).toMatchObject({ verified_email: 'asha.new@trainer.test', email: 'asha.new@trainer.test', app_email: 'asha.new@trainer.test' });
    // Approving twice is refused.
    await http().post(`/v1/admin/trainer-contact-requests/${id}/approve`).set(as(owner)).send({}).expect(409);

    mail.sent.length = 0;
    await worker().runOnce();
    expect(mail.sent.map((m) => m.to).sort()).toEqual(['asha.new@trainer.test', 'asha@trainer.test']);
    const mine = (await http().get('/v1/trainer/contact-requests').set(as(trainerToken)).expect(200)).body;
    expect(mine[0]).toMatchObject({ status: 'approved' });
    expect((await pool.query(`select 1 from audit_log where action = 'trainer.contact_approved'`)).rowCount).toBe(1);
  });

  it('changes the mobile number on approval', async () => {
    await ask({ kind: 'phone', value: '+919822222222' }).expect(200);
    await http().post(`/v1/admin/trainer-contact-requests/${await pendingId()}/approve`).set(as(owner)).send({}).expect(200);
    expect(await row()).toMatchObject({ app_phone: '+919822222222', contact_phone: '+919822222222', verified_email: 'asha@trainer.test' });
  });

  it('keeps the old details when rejected and tells the trainer why; a reason is required', async () => {
    await ask({ kind: 'phone', value: '+919833333333' }).expect(200);
    const id = await pendingId();
    await http().post(`/v1/admin/trainer-contact-requests/${id}/reject`).set(as(owner)).send({}).expect(400);
    await http().post(`/v1/admin/trainer-contact-requests/${id}/reject`).set(as(owner)).send({ note: 'Could not reach you on that number' }).expect(200);
    expect((await row()).app_phone).toBe('+919811111111');
    const mine = (await http().get('/v1/trainer/contact-requests').set(as(trainerToken)).expect(200)).body;
    expect(mine[0]).toMatchObject({ status: 'rejected', decisionNote: 'Could not reach you on that number' });
    mail.sent.length = 0;
    await worker().runOnce();
    expect(mail.sent.some((m) => m.to === 'asha@trainer.test' && /not changed/.test(m.subject))).toBe(true);
  });

  it('refuses an email another account uses, the same value, a second open request, and anyone who is not a trainer', async () => {
    await pool.query(`insert into users (id, verified_email) values (gen_random_uuid(), 'taken@x.test')`);
    await ask({ kind: 'email', value: 'taken@x.test' }).expect(409);
    await ask({ kind: 'email', value: 'asha@trainer.test' }).expect(400);
    await ask({ kind: 'phone', value: '+919811111111' }).expect(400);
    await ask({ kind: 'phone', value: '12345' }).expect(400);
    await ask({ kind: 'phone', value: '+919844444444' }).expect(200);
    await ask({ kind: 'phone', value: '+919855555555' }).expect(409);
    // They can withdraw it and send another.
    await http().delete(`/v1/trainer/contact-requests/${await pendingId()}`).set(as(trainerToken)).expect(200);
    await ask({ kind: 'phone', value: '+919855555555' }).expect(200);
    const stranger = await signIn(app, pool, OTHER);
    await http().post('/v1/trainer/contact-requests').set(as(stranger)).send({ kind: 'phone', value: '+919866666666' }).expect(403);
  });

  it('will not approve an email that another account took after the request was made', async () => {
    await ask({ kind: 'email', value: 'late@trainer.test' }).expect(200);
    await pool.query(`insert into users (id, verified_email) values (gen_random_uuid(), 'late@trainer.test')`);
    await http().post(`/v1/admin/trainer-contact-requests/${await pendingId()}/approve`).set(as(owner)).send({}).expect(409);
    expect((await row()).verified_email).toBe('asha@trainer.test');
  });

  it('limits how many requests one trainer can send in a day', async () => {
    for (let i = 0; i < 5; i += 1) {
      await ask({ kind: 'phone', value: `+91987654321${i}` }).expect(200);
      await http().delete(`/v1/trainer/contact-requests/${await pendingId()}`).set(as(trainerToken)).expect(200);
    }
    await ask({ kind: 'phone', value: '+919876543219' }).expect(429);
  });

  it('removes the requests and the saved mobile when the trainer deletes their account', async () => {
    await ask({ kind: 'phone', value: '+919822222222' }).expect(200);
    await http().post(`/v1/admin/trainer-contact-requests/${await pendingId()}/approve`).set(as(owner)).send({}).expect(200);
    await ask({ kind: 'email', value: 'gone@trainer.test' }).expect(200);
    await http().delete('/v1/trainer-application/account').set(as(trainerToken)).expect(204);
    expect((await pool.query('select 1 from trainer_contact_requests')).rowCount).toBe(0);
    expect((await pool.query('select contact_phone from users where id = $1', [trainerId])).rows[0].contact_phone).toBeNull();
  });
});
