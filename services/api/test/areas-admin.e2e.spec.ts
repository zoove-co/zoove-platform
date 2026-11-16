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

const OWNER = 'owner-areas@zoove.test';
const PIN_A = '499901';
const PIN_B = '499902';
const PIN_C = '499903';

suite('admin areas', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  let ownerToken: string;
  let areaId: string;
  let otherId: string;

  const cleanup = async () => {
    await pool.query(`delete from clusters where slug like 'test-area-%'`);
  };

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) => builder.overrideProvider(EmailProvider).useValue(new MemoryEmail())));
    await cleanup();
    await pool.query(`delete from otp_challenges where email = $1`, [OWNER]);
    await pool.query(`delete from admin_profiles where user_id in (select id from users where verified_email = $1)`, [OWNER]);
    await pool.query(`delete from users where verified_email = $1`, [OWNER]);
    const owner = await pool.query<{ id: string }>(`insert into users (id, verified_email, full_name) values (gen_random_uuid(), $1, 'Ritesh') returning id`, [OWNER]);
    const ownerId = owner.rows[0]!.id;
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [ownerId]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner) values ($1, 'Ritesh', 'Owner', true)`, [ownerId]);
    await pool.query(`update otp_challenges set created_at = created_at - interval '2 minutes' where email = $1`, [OWNER]);
    await http().post('/v1/auth/email-otp/request').send({ email: OWNER, audience: 'admin' }).expect(200);
    ownerToken = (await http().post('/v1/auth/email-otp/verify').send({ email: OWNER, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await pool.end();
  });

  it('needs an admin sign-in', async () => {
    await http().get('/v1/admin/areas').expect(401);
  });

  it('adds a new area switched off, with its pincodes', async () => {
    const res = await http().post('/v1/admin/areas').set(as(ownerToken)).send({ name: 'Test Area One', pincodes: [PIN_A, PIN_B] }).expect(201);
    areaId = res.body.id as string;
    const list = (await http().get('/v1/admin/areas').set(as(ownerToken)).expect(200)).body as { id: string; slug: string; status: string; pincodes: string[]; city: string }[];
    const mine = list.find((a) => a.id === areaId)!;
    expect(mine.slug).toBe('test-area-one');
    expect(mine.status).toBe('locked');
    expect(mine.city).toBe('Mumbai');
    expect(mine.pincodes).toEqual([PIN_A, PIN_B]);
  });

  it('refuses a pincode that already belongs to another area', async () => {
    const other = await http().post('/v1/admin/areas').set(as(ownerToken)).send({ name: 'Test Area Two', pincodes: [PIN_C], active: true }).expect(201);
    otherId = other.body.id as string;
    const res = await http().post(`/v1/admin/areas/${otherId}/pincodes`).set(as(ownerToken)).send({ pincode: PIN_A }).expect(400);
    expect(res.body.error.message).toContain('Test Area One');
    await http().post('/v1/admin/areas').set(as(ownerToken)).send({ name: 'Test Area Three', pincodes: [PIN_B] }).expect(400);
  });

  it('rejects a bad pincode and an unknown area', async () => {
    await http().post(`/v1/admin/areas/${areaId}/pincodes`).set(as(ownerToken)).send({ pincode: '12345' }).expect(400);
    await http().put('/v1/admin/areas/00000000-0000-4000-8000-000000000000/status').set(as(ownerToken)).send({ active: true }).expect(404);
  });

  it('opens and switches off an area, and that decides if an address can be served', async () => {
    const serviceable = async (pin: string) => (await pool.query<{ ok: boolean }>(
      `select exists (select 1 from cluster_pincodes cp join clusters c on c.id = cp.cluster_id where cp.pincode = $1 and c.status = 'active') as ok`, [pin])).rows[0]!.ok;
    expect(await serviceable(PIN_A)).toBe(false);
    const opened = (await http().put(`/v1/admin/areas/${areaId}/status`).set(as(ownerToken)).send({ active: true }).expect(200)).body as { id: string; status: string; activatedAt: string | null }[];
    expect(opened.find((a) => a.id === areaId)).toMatchObject({ status: 'active' });
    expect(opened.find((a) => a.id === areaId)!.activatedAt).not.toBeNull();
    expect(await serviceable(PIN_A)).toBe(true);
    await http().put(`/v1/admin/areas/${areaId}/status`).set(as(ownerToken)).send({ active: false }).expect(200);
    expect(await serviceable(PIN_A)).toBe(false);
  });

  it('adds, removes and renames, and records every change', async () => {
    const added = (await http().post(`/v1/admin/areas/${areaId}/pincodes`).set(as(ownerToken)).send({ pincode: '499904' }).expect(200)).body as { id: string; pincodes: string[] }[];
    expect(added.find((a) => a.id === areaId)!.pincodes).toContain('499904');
    const removed = (await http().delete(`/v1/admin/areas/${areaId}/pincodes/499904`).set(as(ownerToken)).expect(200)).body as { id: string; pincodes: string[] }[];
    expect(removed.find((a) => a.id === areaId)!.pincodes).not.toContain('499904');
    await http().delete(`/v1/admin/areas/${areaId}/pincodes/499904`).set(as(ownerToken)).expect(404);
    const renamed = (await http().post(`/v1/admin/areas/${areaId}`).set(as(ownerToken)).send({ name: 'Test Area One West' }).expect(200)).body as { id: string; name: string }[];
    expect(renamed.find((a) => a.id === areaId)!.name).toBe('Test Area One West');
    const audit = await pool.query<{ action: string }>(`select action from audit_log where entity_type = 'cluster' and entity_id = $1 order by id`, [areaId]);
    expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['area.created', 'area.status_changed', 'area.pincode_added', 'area.pincode_removed', 'area.renamed']));
  });
});
