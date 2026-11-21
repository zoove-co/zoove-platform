import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { DispatchService } from '../src/bookings/dispatch.service';
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

const ME = '+919876543211';
const T1 = '+919800000021';

suite('ops hear about package orders, and see sessions stuck on an inactive trainer', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let me: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  async function owner() {
    const email = 'owner-alerts@zoove.test';
    const user = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [email]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [user.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner, permissions) values ($1, 'Ops', 'Team', true, '{}')`, [user.rows[0]!.id]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    return (await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  }

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) => builder.overrideProvider(EmailProvider).useValue(mail)));
    await pool.query(`update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar'`);
  });
  afterAll(async () => {
    await pool.query(`update clusters set status = 'locked', activated_at = null where slug = 'bandra-khar'`);
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    mail.sent = [];
    await pool.query('truncate table package_purchases, booking_events, customer_notifications, bookings, trainers, trainer_application_events, trainer_documents, trainer_applications, otp_challenges, refresh_tokens, admin_profiles, user_roles, users, outbox_events, audit_log cascade');
    me = await signIn(app, pool, ME);
  });

  it('emails ops when a customer orders a package, once', async () => {
    const pkg = (await http().get('/v1/packages').set(as(me)).expect(200)).body[0] as { id: string; name: string };
    await http().post('/v1/me/packages').set(as(me)).send({ packageId: pkg.id, idempotencyKey: `alerts-${Date.now()}` }).expect(201);
    await app.get(OutboxWorkerService).runOnce();
    const order = mail.sent.filter((m) => m.subject.startsWith('New package order'));
    expect(order).toHaveLength(1);
    expect(order[0]!.to).toBe('ops@zoove.test');
    expect(order[0]!.subject).toContain(pkg.name);
    await app.get(OutboxWorkerService).runOnce();
    expect(mail.sent.filter((m) => m.subject.startsWith('New package order'))).toHaveLength(1);
  });

  it('flags a confirmed session whose trainer was paused or suspended', async () => {
    const admin = await owner();
    const t1User = await signIn(app, pool, T1);
    const trainerId = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [T1])).rows[0]!.id;
    const appId = await pool.query<{ id: string }>(`insert into trainer_applications (id, user_id, status, first_name, last_name) values (gen_random_uuid(), $1, 'approved', 'Asha', 'Rao') returning id`, [trainerId]);
    await pool.query(`insert into trainers (user_id, application_id) values ($1, $2)`, [trainerId, appId.rows[0]!.id]);
    const addressId = (await http().post('/v1/addresses').set(as(me)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
    const booking = (await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId, idempotencyKey: `alerts-b-${Date.now()}` }).expect(201)).body.id as string;
    await app.get(DispatchService).runOnce();
    await http().post(`/v1/trainer/jobs/${booking}/accept`).set(as(t1User)).expect(200);
    const keys = async () => ((await http().get('/v1/admin/attention').set(as(admin)).expect(200)).body.groups as { key: string }[]).map((g) => g.key);
    expect(await keys()).not.toContain('trainer_inactive');
    await pool.query(`update trainers set status = 'suspended' where user_id = $1`, [trainerId]);
    expect(await keys()).toContain('trainer_inactive');
  });
  it('lists a new unpaid package order in Needs attention at once, and urgent after a day', async () => {
    const admin = await owner();
    const pkg = (await http().get('/v1/packages').set(as(me)).expect(200)).body[0] as { id: string };
    const order = (await http().post('/v1/me/packages').set(as(me)).send({ packageId: pkg.id, idempotencyKey: `alerts-p-${Date.now()}` }).expect(201)).body as { id: string };
    const group = async () => ((await http().get('/v1/admin/attention').set(as(admin)).expect(200)).body.groups as { key: string; items: { id: string; urgent: boolean }[] }[]).find((g) => g.key === 'packages');
    expect((await group())?.items).toEqual([expect.objectContaining({ id: order.id, urgent: false })]);
    await pool.query(`update package_purchases set created_at = now() - interval '2 days' where id = $1`, [order.id]);
    expect((await group())?.items[0]).toMatchObject({ id: order.id, urgent: true });
    await pool.query(`update package_purchases set status = 'paid', paid_at = now() where id = $1`, [order.id]);
    expect(await group()).toBeUndefined();
  });

  it('finds a session from the first letters of its code', async () => {
    const admin = await owner();
    const addressId = (await http().post('/v1/addresses').set(as(me)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
    const id = (await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId, idempotencyKey: `alerts-s-${Date.now()}` }).expect(201)).body.id as string;
    const code = `ZV-${id.replace(/-/g, '').slice(-8).toUpperCase()}`;
    const find = async (q: string) => { const body = (await http().get('/v1/admin/sessions').query({ filter: 'all', q }).set(as(admin)).expect(200)).body as { items?: { id: string }[] } | { id: string }[]; return Array.isArray(body) ? body : (body.items ?? []); };
    for (const q of [code, code.slice(0, 7), code.slice(0, 10), code.slice(3, 7).toLowerCase()]) expect((await find(q)).map((x) => x.id)).toContain(id);
    expect(await find('ZV-ZZZZ')).toEqual([]);
  });
});
