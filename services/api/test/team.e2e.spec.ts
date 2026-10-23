import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { EmailProvider, type EmailMessage } from '../src/email/email.provider';
import { OutboxWorkerService } from '../src/notifications/outbox-worker.service';
import { StorageService } from '../src/storage/storage.service';
import { CODE, startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

class MemoryEmail extends EmailProvider {
  sent: EmailMessage[] = [];
  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}
class NoStorage extends StorageService {
  put(): Promise<void> {
    return Promise.resolve();
  }
  signedGetUrl(): Promise<string> {
    return Promise.resolve('https://files.test/x');
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

const OWNER = 'owner@zoove.test';
const MEMBER = 'Asha.Ops@Zoove.test';

suite('admin team and permissions', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const mail = new MemoryEmail();
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function login(email: string): Promise<string> {
    await pool.query(`update otp_challenges set created_at = created_at - interval '2 minutes' where email = $1`, [email.toLowerCase()]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    const response = await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200);
    return response.body.token as string;
  }
  const drain = async () => {
    const worker = app.get(OutboxWorkerService);
    for (let i = 0; i < 3; i += 1) await worker.runOnce();
  };

  let ownerToken: string;
  let memberToken: string;
  let ownerId: string;
  let memberId: string;

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) => builder.overrideProvider(EmailProvider).useValue(mail).overrideProvider(StorageService).useValue(new NoStorage())));
    await pool.query('truncate table trainer_application_events, trainer_documents, trainers, trainer_applications, outbox_events, audit_log restart identity cascade');
    await pool.query(`delete from otp_challenges where email is not null`);
    await pool.query(`delete from admin_profiles`);
    await pool.query(`delete from user_roles where role = 'admin'`);
    await pool.query(`delete from users where verified_email is not null`);
    const owner = await pool.query<{ id: string }>(`insert into users (id, verified_email, full_name) values (gen_random_uuid(), $1, 'Ritesh') returning id`, [OWNER]);
    ownerId = owner.rows[0]!.id;
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [ownerId]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner) values ($1, 'Ritesh', 'Owner', true)`, [ownerId]);
    ownerToken = await login(OWNER);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('shows an owner their own profile with every permission', async () => {
    const me = await http().get('/v1/admin/me').set(as(ownerToken)).expect(200);
    expect(me.body).toMatchObject({ name: 'Ritesh', email: OWNER, jobTitle: 'Owner', isOwner: true, active: true });
    expect(me.body.permissions).toEqual(expect.arrayContaining(['trainers.view', 'trainers.documents', 'trainers.decide']));
  });

  it('adds a member, emails them, and they can sign in with their email', async () => {
    const added = await http()
      .post('/v1/admin/team')
      .set(as(ownerToken))
      .send({ name: 'Asha Menon', email: MEMBER, jobTitle: 'Operations', reportsTo: ownerId, permissions: ['trainers.decide'] })
      .expect(201);
    memberId = added.body.id as string;
    // Turning on "decide" also turns on "view": you cannot decide on what you cannot see.
    expect(added.body).toMatchObject({ name: 'Asha Menon', email: MEMBER.toLowerCase(), jobTitle: 'Operations', isOwner: false, active: true, reportsTo: { id: ownerId, name: 'Ritesh' } });
    expect(added.body.permissions).toEqual(['trainers.view', 'trainers.decide']);

    await drain();
    const invite = mail.sent.find((m) => m.to === MEMBER.toLowerCase() && m.subject === 'You have been added to Zoove admin');
    expect(invite?.text).toContain('Ritesh added you to the Zoove admin team as Operations');

    memberToken = await login(MEMBER);
    const me = await http().get('/v1/admin/me').set(as(memberToken)).expect(200);
    expect(me.body).toMatchObject({ name: 'Asha Menon', jobTitle: 'Operations', isOwner: false });
  });

  it('refuses to add the same person twice', async () => {
    const again = await http().post('/v1/admin/team').set(as(ownerToken)).send({ name: 'Asha', email: MEMBER, jobTitle: 'Ops', permissions: [] }).expect(409);
    expect(again.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('keeps team management for owners only', async () => {
    await http().get('/v1/admin/team').set(as(memberToken)).expect(403);
    await http().post('/v1/admin/team').set(as(memberToken)).send({ name: 'Eve', email: 'eve@zoove.test', jobTitle: 'Ops', permissions: [] }).expect(403);
    await http().patch(`/v1/admin/team/${memberId}`).set(as(memberToken)).send({ isOwner: true }).expect(403);
    const list = await http().get('/v1/admin/team').set(as(ownerToken)).expect(200);
    expect(list.body.members.map((m: { name: string }) => m.name)).toEqual(['Ritesh', 'Asha Menon']);
    expect(list.body.permissions.length).toBeGreaterThan(3);
  });

  it('checks permissions on every trainer route, and a change applies on the next request', async () => {
    await http().get('/v1/admin/trainer-applications').set(as(memberToken)).expect(200); // view, switched on with decide
    const fake = '3f6d2f8e-0000-7000-8000-000000000000';
    const link = await http().get(`/v1/admin/trainer-applications/${fake}/documents/${fake}/url`).set(as(memberToken)).expect(403);
    expect(link.body.error.code).toBe('FORBIDDEN');

    await http().patch(`/v1/admin/team/${memberId}`).set(as(ownerToken)).send({ permissions: [] }).expect(200);
    await http().get('/v1/admin/trainer-applications').set(as(memberToken)).expect(403);
    await http().post(`/v1/admin/trainer-applications/${fake}/approve`).set(as(memberToken)).send({}).expect(403);
  });

  it('lets an owner change the role label at any time', async () => {
    const changed = await http().patch(`/v1/admin/team/${memberId}`).set(as(ownerToken)).send({ jobTitle: 'Trainer relations lead', reportsTo: null }).expect(200);
    expect(changed.body).toMatchObject({ jobTitle: 'Trainer relations lead', reportsTo: null });
    const me = await http().get('/v1/admin/me').set(as(memberToken)).expect(200);
    expect(me.body.jobTitle).toBe('Trainer relations lead');
  });

  it('switching someone off stops them at once and blocks new codes; switching on restores them', async () => {
    await http().patch(`/v1/admin/team/${memberId}`).set(as(ownerToken)).send({ active: false }).expect(200);
    await http().get('/v1/admin/me').set(as(memberToken)).expect(401);
    const before = mail.sent.length;
    await pool.query(`update otp_challenges set created_at = created_at - interval '2 minutes' where email = $1`, [MEMBER.toLowerCase()]);
    await http().post('/v1/auth/email-otp/request').send({ email: MEMBER, audience: 'admin' }).expect(200);
    expect(mail.sent.length).toBe(before); // no code is sent to a switched-off admin

    await http().patch(`/v1/admin/team/${memberId}`).set(as(ownerToken)).send({ active: true }).expect(200);
    memberToken = await login(MEMBER);
    await http().get('/v1/admin/me').set(as(memberToken)).expect(200);
  });

  it('never leaves the team without an active owner, and an owner cannot switch themselves off', async () => {
    const demote = await http().patch(`/v1/admin/team/${ownerId}`).set(as(ownerToken)).send({ isOwner: false }).expect(409);
    expect(demote.body.error.code).toBe('INVALID_STATE');
    await http().patch(`/v1/admin/team/${ownerId}`).set(as(ownerToken)).send({ active: false }).expect(409);
    // A second owner makes demoting the first possible.
    await http().patch(`/v1/admin/team/${memberId}`).set(as(ownerToken)).send({ isOwner: true }).expect(200);
    await http().patch(`/v1/admin/team/${ownerId}`).set(as(ownerToken)).send({ isOwner: false }).expect(200);
    await http().patch(`/v1/admin/team/${ownerId}`).set(as(memberToken)).send({ isOwner: true }).expect(200);
  });

  it('rejects bad input and records changes in the audit log', async () => {
    await http().post('/v1/admin/team').set(as(memberToken)).send({ name: 'X', email: 'not-an-email', jobTitle: '', permissions: ['nope'] }).expect(400);
    await http().patch(`/v1/admin/team/${memberId}`).set(as(memberToken)).send({}).expect(400);
    await http().patch(`/v1/admin/team/${memberId}`).set(as(memberToken)).send({ reportsTo: memberId }).expect(400);
    const audit = await pool.query<{ action: string }>(`select action from audit_log where entity_type = 'admin_profile' order by created_at`);
    expect(audit.rows[0]?.action).toBe('team.member_added');
    expect(audit.rows.filter((row) => row.action === 'team.member_updated').length).toBeGreaterThanOrEqual(5);
  });
});
