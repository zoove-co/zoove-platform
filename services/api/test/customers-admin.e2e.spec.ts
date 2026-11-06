import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { EmailProvider, type EmailMessage } from '../src/email/email.provider';
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

const OWNER = 'owner@zoove.test';

suite('admin customers', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  let ownerToken: string;
  let ownerId: string;
  let anitaId: string;

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) => builder.overrideProvider(EmailProvider).useValue(new MemoryEmail())));
    await pool.query('truncate table audit_log restart identity cascade');
    await pool.query(`delete from otp_challenges where email = $1`, [OWNER]);
    await pool.query(`delete from admin_profiles where user_id in (select id from users where verified_email = $1)`, [OWNER]);
    await pool.query(`delete from users where verified_email = $1`, [OWNER]);
    const owner = await pool.query<{ id: string }>(`insert into users (id, verified_email, full_name) values (gen_random_uuid(), $1, 'Ritesh') returning id`, [OWNER]);
    ownerId = owner.rows[0]!.id;
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [ownerId]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner) values ($1, 'Ritesh', 'Owner', true)`, [ownerId]);
    await pool.query(`update otp_challenges set created_at = created_at - interval '2 minutes' where email = $1`, [OWNER]);
    await http().post('/v1/auth/email-otp/request').send({ email: OWNER, audience: 'admin' }).expect(200);
    ownerToken = (await http().post('/v1/auth/email-otp/verify').send({ email: OWNER, code: CODE, audience: 'admin' }).expect(200)).body.token as string;

    await pool.query(`delete from users where phone_e164 in ('+919800000001', '+919800000002')`);
    const anita = await pool.query<{ id: string }>(`insert into users (phone_e164, full_name, email) values ('+919800000001', 'Anita Rao', 'anita@example.com') returning id`);
    anitaId = anita.rows[0]!.id;
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'customer')`, [anitaId]);
    await pool.query(
      `insert into addresses (user_id, label, line1, city, pincode, location, is_default) values ($1, 'Home', '12 Hill Road', 'Mumbai', '400050', 'SRID=4326;POINT(72.83 19.05)'::geography, true)`,
      [anitaId],
    );
    const bob = await pool.query<{ id: string }>(`insert into users (phone_e164, full_name) values ('+919800000002', 'Bob Shah') returning id`);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'customer')`, [bob.rows[0]!.id]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('needs an admin with the customers permission', async () => {
    await http().get('/v1/admin/customers').expect(401);
  });

  it('lists customers and finds them by name, email or phone', async () => {
    const all = await http().get('/v1/admin/customers').set(as(ownerToken)).expect(200);
    // Other tests may have left customers behind, so look for ours rather than counting.
    expect(all.body.total).toBeGreaterThanOrEqual(2);
    expect(all.body.customers.map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['Anita Rao', 'Bob Shah']));
    expect(all.body.customers.find((c: { name: string }) => c.name === 'Anita Rao')).toMatchObject({ email: 'anita@example.com', phone: '+919800000001', sessionsDone: 0, sessionsUpcoming: 0, spentPaise: 0 });
    for (const q of ['anita', 'EXAMPLE.com', '9800000001']) {
      const found = await http().get('/v1/admin/customers').query({ q }).set(as(ownerToken)).expect(200);
      expect(found.body.customers.map((c: { name: string }) => c.name)).toEqual(['Anita Rao']);
    }
    expect((await http().get('/v1/admin/customers').query({ q: '%' }).set(as(ownerToken)).expect(200)).body.total).toBe(0); // a typed % is not a wildcard
    expect((await http().get('/v1/admin/customers').query({ q: 'nobody' }).set(as(ownerToken)).expect(200)).body.customers).toEqual([]);
  });

  it('does not list admins or trainers as customers', async () => {
    const all = await http().get('/v1/admin/customers').set(as(ownerToken)).expect(200);
    expect(all.body.customers.some((c: { id: string }) => c.id === ownerId)).toBe(false);
    await http().get(`/v1/admin/customers/${ownerId}`).set(as(ownerToken)).expect(404);
  });

  it('opens a customer with addresses and records that it was opened', async () => {
    const detail = await http().get(`/v1/admin/customers/${anitaId}`).set(as(ownerToken)).expect(200);
    expect(detail.body).toMatchObject({ name: 'Anita Rao', referralCode: null, referredBy: null, ratingsGiven: 0, bookings: [], packages: [] });
    expect(detail.body.addresses).toEqual([expect.objectContaining({ label: 'Home', line1: '12 Hill Road', pincode: '400050', isDefault: true })]);
    const audit = await pool.query(`select actor_user_id from audit_log where action = 'customer.view' and entity_id = $1`, [anitaId]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_user_id).toBe(ownerId);
    await http().get('/v1/admin/customers/not-an-id').set(as(ownerToken)).expect(400);
  });

  it('filters the sessions list to one customer', async () => {
    const mine = await http().get('/v1/admin/sessions').query({ filter: 'all', customerId: anitaId }).set(as(ownerToken)).expect(200);
    expect(mine.body).toEqual([]); // Anita has not booked
    const everyone = await http().get('/v1/admin/sessions').query({ filter: 'all' }).set(as(ownerToken)).expect(200);
    expect(Array.isArray(everyone.body)).toBe(true);
    await http().get('/v1/admin/sessions').query({ filter: 'all', customerId: 'nope' }).set(as(ownerToken)).expect(400);
  });
});
