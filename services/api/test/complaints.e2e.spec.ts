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

const CUSTOMER = '+919876543211';
const OTHER_CUSTOMER = '+919876543212';
const TRAINER = '+919800000031';

type Thread = { id: string; code: string; status: string; unread: boolean; canReply: boolean; messages: { from: string; body: string }[]; session: { id: string } | null };
type AdminThread = { id: string; status: string; urgent: boolean; messages: { from: string; internal: boolean; body: string }[]; session: { trainerName: string | null; customerName: string | null } | null; related: { side: string }[]; person: { complaintsTotal: number } };

suite('complaints: a thread between a customer or trainer and the Zoove team', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let customer: string;
  let trainer: string;
  let trainerId: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = () => `complaint-${Date.now()}-${(n += 1)}`;
  async function admin(email: string, isOwner: boolean, permissions: string[]) {
    const user = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [email]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [user.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner, permissions) values ($1, $2, 'Support', $3, $4)`, [user.rows[0]!.id, email.split('@')[0], isOwner, permissions]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    const token = (await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
    return { token, id: user.rows[0]!.id };
  }
  const raise = (token: string, body: Record<string, unknown>, base = '/v1/complaints') => http().post(base).set(as(token)).send({ idempotencyKey: key(), message: 'This is what happened.', ...body });
  // One confirmed session: the customer booked it and the trainer accepted it.
  async function session(): Promise<string> {
    const addressId = (await http().post('/v1/addresses').set(as(customer)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
    const booking = (await http().post('/v1/bookings').set(as(customer)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId, idempotencyKey: key() }).expect(201)).body.id as string;
    await app.get(DispatchService).runOnce();
    await http().post(`/v1/trainer/jobs/${booking}/accept`).set(as(trainer)).expect(200);
    return booking;
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
    await pool.query('truncate table complaints, package_purchases, booking_events, customer_notifications, bookings, trainers, trainer_application_events, trainer_documents, trainer_applications, otp_challenges, refresh_tokens, admin_profiles, user_roles, users, outbox_events, audit_log cascade');
    customer = await signIn(app, pool, CUSTOMER);
    trainer = await signIn(app, pool, TRAINER);
    trainerId = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [TRAINER])).rows[0]!.id;
    const application = await pool.query<{ id: string }>(`insert into trainer_applications (id, user_id, status, first_name, last_name) values (gen_random_uuid(), $1, 'approved', 'Asha', 'Rao') returning id`, [trainerId]);
    await pool.query(`insert into trainers (user_id, application_id) values ($1, $2)`, [trainerId, application.rows[0]!.id]);
  });

  it('a customer raises a general complaint, the team answers, the customer is told, and it can be reopened', async () => {
    const ops = await admin('ops@zoove.test', false, ['complaints.customers']);
    const created = (await raise(customer, { category: 'payment_or_package', message: 'I was charged twice for my package.' }).expect(200)).body as Thread;
    expect(created).toMatchObject({ status: 'open', unread: false, session: null });
    expect(created.code).toMatch(/^ZC-[0-9A-F]{8}$/);
    expect(created.messages.map((m) => m.from)).toEqual(['you', 'system']);

    await app.get(OutboxWorkerService).runOnce();
    expect(mail.sent.filter((m) => m.subject.includes(created.code))).toHaveLength(1);

    const inbox = (await http().get('/v1/admin/complaints').set(as(ops.token)).expect(200)).body as { id: string; status: string }[];
    expect(inbox.map((c) => c.id)).toEqual([created.id]);
    expect((await http().get('/v1/admin/complaints/summary').set(as(ops.token)).expect(200)).body).toEqual({ open: 1, urgent: 0 });

    // The team writes: the customer is notified and sees it as unread until they open the thread.
    await http().post(`/v1/admin/complaints/${created.id}/note`).set(as(ops.token)).send({ body: 'Checked the payment gateway, looks like a double charge.' }).expect(200);
    const replied = (await http().post(`/v1/admin/complaints/${created.id}/reply`).set(as(ops.token)).send({ body: 'Sorry about that. We are refunding the extra charge today.' }).expect(200)).body as AdminThread;
    expect(replied.status).toBe('waiting_on_user');
    expect((await http().get('/v1/admin/complaints/summary').set(as(ops.token)).expect(200)).body).toEqual({ open: 0, urgent: 0 });
    const notice = await pool.query<{ title: string; body: string }>(`select title, body from customer_notifications where title like $1`, [`%${created.code}`]);
    expect(notice.rows).toHaveLength(1);
    expect(notice.rows[0]!.body).toContain('refunding');
    expect(((await http().get('/v1/complaints/unread').set(as(customer)).expect(200)).body as { unread: number }).unread).toBe(1);
    const list = (await http().get('/v1/complaints').set(as(customer)).expect(200)).body as { active: { id: string; unread: boolean }[]; past: unknown[]; unread: number };
    expect(list).toMatchObject({ unread: 1, past: [] });
    expect(list.active[0]).toMatchObject({ id: created.id, unread: true });

    // The customer never sees the team's private note.
    const opened = (await http().get(`/v1/complaints/${created.id}`).set(as(customer)).expect(200)).body as Thread;
    expect(opened.messages.map((m) => m.from)).toEqual(['you', 'system', 'team']);
    expect(JSON.stringify(opened)).not.toContain('double charge');
    expect(((await http().get('/v1/complaints/unread').set(as(customer)).expect(200)).body as { unread: number }).unread).toBe(0);

    // Their reply puts it back in the team's list. Resolving shows the note and closes it.
    const back = (await http().post(`/v1/complaints/${created.id}/messages`).set(as(customer)).send({ body: 'Thank you.' }).expect(200)).body as Thread;
    expect(back.status).toBe('open');
    await http().post(`/v1/admin/complaints/${created.id}/resolve`).set(as(ops.token)).send({ note: 'Refund of the extra charge was sent today.' }).expect(200);
    const resolved = (await http().get(`/v1/complaints/${created.id}`).set(as(customer)).expect(200)).body as Thread;
    expect(resolved).toMatchObject({ status: 'resolved', canReply: true });
    expect(resolved.messages.at(-2)?.body).toContain('Refund of the extra charge');
    expect(((await http().get('/v1/complaints').set(as(customer)).expect(200)).body as { active: unknown[]; past: unknown[] }).past).toHaveLength(1);

    // Within seven days a reply reopens it. Later, a new complaint is needed.
    expect(((await http().post(`/v1/complaints/${created.id}/messages`).set(as(customer)).send({ body: 'Still waiting for the refund.' }).expect(200)).body as Thread).status).toBe('open');
    await http().post(`/v1/admin/complaints/${created.id}/resolve`).set(as(ops.token)).send({ note: 'Refund confirmed by the bank.' }).expect(200);
    await pool.query(`update complaints set resolved_at = now() - interval '8 days' where id = $1`, [created.id]);
    const late = await http().post(`/v1/complaints/${created.id}/messages`).set(as(customer)).send({ body: 'One more thing.' }).expect(409);
    expect(late.body.error.code).toBe('INVALID_STATE');
    const audit = await pool.query<{ action: string }>(`select action from audit_log where entity_type = 'complaint' order by created_at`);
    expect(audit.rows.map((a) => a.action)).toEqual(expect.arrayContaining(['complaint.replied', 'complaint.resolved']));
  });

  it('keeps the customer thread and the trainer thread about one session apart', async () => {
    const booking = await session();
    const ops = await admin('both@zoove.test', false, ['complaints.customers', 'complaints.trainers']);
    const mine = await raise(customer, { category: 'trainer_late_or_no_show', bookingId: booking, message: 'The trainer came 40 minutes late.' }).expect(200);
    const theirs = await raise(trainer, { category: 'customer_unavailable', bookingId: booking, message: 'Nobody opened the door.' }, '/v1/trainer/complaints').expect(200);
    expect((mine.body as Thread).session?.id).toBe(booking);
    expect(mine.body.id).not.toBe(theirs.body.id);

    expect(((await http().get('/v1/complaints').set(as(customer)).expect(200)).body as { active: { id: string }[] }).active.map((c) => c.id)).toEqual([mine.body.id]);
    expect(((await http().get('/v1/trainer/complaints').set(as(trainer)).expect(200)).body as { active: { id: string }[] }).active.map((c) => c.id)).toEqual([theirs.body.id]);
    // Each person can open only their own thread.
    await http().get(`/v1/complaints/${theirs.body.id}`).set(as(customer)).expect(404);
    await http().get(`/v1/trainer/complaints/${mine.body.id}`).set(as(trainer)).expect(404);
    await http().post(`/v1/complaints/${theirs.body.id}/messages`).set(as(customer)).send({ body: 'Let me in.' }).expect(404);

    // The team sees both, with the session, the people and the other side's complaint.
    const detail = (await http().get(`/v1/admin/complaints/${mine.body.id}`).set(as(ops.token)).expect(200)).body as AdminThread;
    expect(detail.session?.trainerName).toBe('Asha Rao');
    expect(detail.related).toEqual([expect.objectContaining({ side: 'trainer' })]);
    // Replying to the trainer notifies the trainer, not the customer.
    await http().post(`/v1/admin/complaints/${theirs.body.id}/reply`).set(as(ops.token)).send({ body: 'Thanks, we are calling the customer.' }).expect(200);
    expect(((await http().get('/v1/trainer/complaints/unread').set(as(trainer)).expect(200)).body as { unread: number }).unread).toBe(1);
    expect(((await http().get('/v1/complaints/unread').set(as(customer)).expect(200)).body as { unread: number }).unread).toBe(0);
    expect((await pool.query(`select 1 from outbox_events where event_type = 'complaint.trainer_reply'`)).rowCount).toBe(1);
  });

  it('only accepts sessions that belong to the person, and a session when the topic needs one', async () => {
    const booking = await session();
    const other = await signIn(app, pool, OTHER_CUSTOMER);
    await raise(other, { category: 'session_quality', bookingId: booking }).expect(404);
    await raise(customer, { category: 'session_quality' }).expect(400);
    await raise(customer, { category: 'nonsense' }).expect(400);
    await raise(customer, { category: 'customer_behaviour' }).expect(400); // a trainer's topic
    await raise(customer, { category: 'other', message: 'ab' }).expect(400);
    const picker = (await http().get('/v1/complaints/sessions').set(as(customer)).expect(200)).body as { id: string; code: string }[];
    expect(picker.map((s) => s.id)).toEqual([booking]);
    expect(((await http().get('/v1/trainer/complaints/sessions').set(as(trainer)).expect(200)).body as { id: string }[]).map((s) => s.id)).toEqual([booking]);
  });

  it('only approved trainers can use the trainer side', async () => {
    await http().get('/v1/trainer/complaints').set(as(customer)).expect(403);
    await raise(customer, { category: 'payout' }, '/v1/trainer/complaints').expect(403);
  });

  it('sending the same complaint twice, or a second one on the same open topic, makes one thread', async () => {
    const booking = await session();
    const sameKey = key();
    const a = await http().post('/v1/complaints').set(as(customer)).send({ category: 'session_quality', bookingId: booking, message: 'The session was cut short.', idempotencyKey: sameKey }).expect(200);
    const b = await http().post('/v1/complaints').set(as(customer)).send({ category: 'session_quality', bookingId: booking, message: 'The session was cut short.', idempotencyKey: sameKey }).expect(200);
    expect(b.body.id).toBe(a.body.id);
    const c = await raise(customer, { category: 'session_quality', bookingId: booking, message: 'Also, the trainer left early.' }).expect(200);
    expect(c.body.id).toBe(a.body.id);
    expect((c.body as Thread).messages.filter((m) => m.from === 'you')).toHaveLength(2);
    expect((await pool.query(`select 1 from complaints`)).rowCount).toBe(1);
  });

  it('limits new complaints per day', async () => {
    for (let i = 0; i < 5; i += 1) await raise(customer, { category: 'other', message: `Something else number ${i}.` }).expect(200);
    const sixth = await raise(customer, { category: 'other', message: 'And another one.' }).expect(429);
    expect(sixth.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('marks safety complaints urgent, alerts the team, and shows them in Needs attention', async () => {
    const ops = await admin('safety@zoove.test', true, []);
    const normal = (await raise(customer, { category: 'app_problem' }).expect(200)).body as Thread;
    const safety = (await raise(customer, { category: 'trainer_behaviour', message: 'The trainer made me uncomfortable.' }).expect(200)).body as Thread;
    await app.get(OutboxWorkerService).runOnce();
    expect(mail.sent.some((m) => m.subject.startsWith('URGENT') && m.subject.includes(safety.code))).toBe(true);
    expect(mail.sent.some((m) => m.subject.startsWith('URGENT') && m.subject.includes(normal.code))).toBe(false);
    expect((await http().get('/v1/admin/complaints/summary').set(as(ops.token)).expect(200)).body).toEqual({ open: 2, urgent: 1 });
    // Safety comes first in the inbox.
    expect(((await http().get('/v1/admin/complaints').set(as(ops.token)).expect(200)).body as { id: string }[]).map((c) => c.id)).toEqual([safety.id, normal.id]);
    const attention = (await http().get('/v1/admin/attention').set(as(ops.token)).expect(200)).body as { groups: { key: string; items: { id: string; urgent: boolean }[] }[] };
    const group = attention.groups.find((g) => g.key === 'complaints');
    expect(group?.items.find((i) => i.id === safety.id)?.urgent).toBe(true);
    expect(group?.items.find((i) => i.id === normal.id)?.urgent).toBe(false);
  });

  it('lets each admin handle only the sides they are allowed, and finds complaints by code, session or name', async () => {
    const booking = await session();
    const customerOnly = await admin('customers@zoove.test', false, ['complaints.customers']);
    const trainerOnly = await admin('trainers@zoove.test', false, ['complaints.trainers']);
    const nobody = await admin('nobody@zoove.test', false, ['customers.view']);
    const mine = (await raise(customer, { category: 'trainer_late_or_no_show', bookingId: booking }).expect(200)).body as Thread;
    const theirs = (await raise(trainer, { category: 'payout', message: 'My payout is missing.' }, '/v1/trainer/complaints').expect(200)).body as Thread;

    const ids = async (token: string, query = '') => ((await http().get(`/v1/admin/complaints${query}`).set(as(token)).expect(200)).body as { id: string }[]).map((c) => c.id);
    expect(await ids(customerOnly.token)).toEqual([mine.id]);
    expect(await ids(trainerOnly.token)).toEqual([theirs.id]);
    await http().get(`/v1/admin/complaints/${theirs.id}`).set(as(customerOnly.token)).expect(403);
    await http().post(`/v1/admin/complaints/${mine.id}/reply`).set(as(trainerOnly.token)).send({ body: 'Hello' }).expect(403);
    await http().get('/v1/admin/complaints?side=trainer').set(as(customerOnly.token)).expect(403);
    await http().get('/v1/admin/complaints').set(as(nobody.token)).expect(403);
    await http().get('/v1/admin/complaints').set(as(customer)).expect(403);

    const owner = await admin('boss@zoove.test', true, []);
    const sessionCode = `ZV-${booking.replace(/-/g, '').slice(-8).toUpperCase()}`;
    expect(await ids(owner.token, `?q=${mine.code}`)).toEqual([mine.id]);
    expect(await ids(owner.token, `?q=${mine.code.slice(0, 6).toLowerCase()}`)).toContain(mine.id);
    expect(await ids(owner.token, `?q=${sessionCode}`)).toEqual([mine.id]);
    expect(await ids(owner.token, '?q=%2B919800000031')).toEqual([theirs.id]);
    expect(await ids(owner.token, '?q=nothing-like-this')).toEqual([]);
    expect(await ids(owner.token, '?side=trainer')).toEqual([theirs.id]);

    // Complaints on a session and on a person are listed for their pages.
    expect(((await http().get(`/v1/admin/complaints/by-session/${booking}`).set(as(owner.token)).expect(200)).body as unknown[])).toHaveLength(1);
    expect(((await http().get(`/v1/admin/complaints/by-person/${trainerId}`).set(as(owner.token)).expect(200)).body as unknown[])).toHaveLength(1);
  });

  it('assigns, notes, resolves and reopens, and refuses to reply to a resolved complaint', async () => {
    const ops = await admin('lead@zoove.test', true, []);
    const helper = await admin('helper@zoove.test', false, ['complaints.customers']);
    const c = (await raise(customer, { category: 'other', message: 'I need some help.' }).expect(200)).body as Thread;
    const assigned = (await http().post(`/v1/admin/complaints/${c.id}/assign`).set(as(ops.token)).send({ assigneeId: helper.id }).expect(200)).body as AdminThread & { assignedToId: string };
    expect(assigned.assignedToId).toBe(helper.id);
    await http().post(`/v1/admin/complaints/${c.id}/assign`).set(as(ops.token)).send({ assigneeId: customer.length ? '00000000-0000-4000-8000-000000000000' : null }).expect(400);
    expect(((await http().get('/v1/admin/complaints?mine=true').set(as(helper.token)).expect(200)).body as unknown[])).toHaveLength(1);
    expect(((await http().get('/v1/admin/complaints?mine=true').set(as(ops.token)).expect(200)).body as unknown[])).toHaveLength(0);

    await http().post(`/v1/admin/complaints/${c.id}/resolve`).set(as(helper.token)).send({ note: 'ok' }).expect(400); // the note is what the person reads
    await http().post(`/v1/admin/complaints/${c.id}/resolve`).set(as(helper.token)).send({ note: 'Sorted: we called you and fixed it.' }).expect(200);
    await http().post(`/v1/admin/complaints/${c.id}/reply`).set(as(helper.token)).send({ body: 'One more thing' }).expect(409);
    await http().post(`/v1/admin/complaints/${c.id}/resolve`).set(as(helper.token)).send({ note: 'Sorted again.' }).expect(409);
    const reopened = (await http().post(`/v1/admin/complaints/${c.id}/reopen`).set(as(helper.token)).expect(200)).body as AdminThread;
    expect(reopened.status).toBe('open');
    expect(((await http().get('/v1/admin/complaints?status=resolved').set(as(ops.token)).expect(200)).body as unknown[])).toHaveLength(0);
  });

  it('refuses a person who is not signed in', async () => {
    await http().get('/v1/complaints').expect(401);
    await http().get('/v1/trainer/complaints').expect(401);
    await http().get('/v1/admin/complaints').expect(401);
  });
});
