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

const OWNER = 'owner-offerings@zoove.test';
const STAFF = 'staff-offerings@zoove.test';
const ME = '+919876543210';
const FRIEND = '+919812345678';
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number, hour = 18) => new Date(`${isoDate(days)}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString();

suite('offerings, rewards and trainer cancellation', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let owner: string;
  let staff: string;
  let me: string;
  let friend: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = () => `off-key-${Date.now()}-${(n += 1)}`;
  async function adminToken(email: string, name: string, owns: boolean, permissions: string[]) {
    const user = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [email]);
    await pool.query(`insert into user_roles (user_id, role) values ($1, 'admin')`, [user.rows[0]!.id]);
    await pool.query(`insert into admin_profiles (user_id, display_name, job_title, is_owner, permissions) values ($1, $2, 'Team', $3, $4)`, [user.rows[0]!.id, name, owns, permissions]);
    await http().post('/v1/auth/email-otp/request').send({ email, audience: 'admin' }).expect(200);
    return (await http().post('/v1/auth/email-otp/verify').send({ email, code: CODE, audience: 'admin' }).expect(200)).body.token as string;
  }
  async function addressFor(t: string) {
    return (await http().post('/v1/addresses').set(as(t)).send({ label: 'Home', line: `D-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
  }
  const book = (t: string, addressId: string, day: number, extra: object = {}) =>
    http().post('/v1/bookings').set(as(t)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId, startsAt: slot(day), idempotencyKey: key(), ...extra });
  async function makeTrainer(first: string): Promise<string> {
    const u = await pool.query<{ id: string }>(`insert into users (id, verified_email) values (gen_random_uuid(), $1) returning id`, [`${first.toLowerCase()}-${(n += 1)}@trainer.test`]);
    const appId = await pool.query<{ id: string }>(`insert into trainer_applications (id, user_id, status, first_name, last_name) values (gen_random_uuid(), $1, 'approved', $2, 'Rao') returning id`, [u.rows[0]!.id, first]);
    await pool.query(`insert into trainers (user_id, application_id) values ($1, $2)`, [u.rows[0]!.id, appId.rows[0]!.id]);
    return u.rows[0]!.id;
  }

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (builder) => builder.overrideProvider(EmailProvider).useValue(mail)));
    await pool.query(`update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar'`);
  });
  afterAll(async () => {
    await pool.query(`update clusters set status = 'locked', activated_at = null where slug = 'bandra-khar'`);
    await pool.query(`delete from services where slug like 'zz-test-%'`);
    await pool.query(`update reward_rules set enabled = false, kind = null, flat_off_paise = null, percent_off = null, max_discount_paise = null`);
    await pool.query(`update participant_pricing set percent_of_personal = 160, per_head = false, is_placeholder = true where participant = 'duo'`);
    await pool.query(`update service_prices set is_active = false where service_id is null and mode = 'scheduled' and price_paise <> 150000`);
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query('truncate table referral_rewards, referrals, referral_codes, discount_attempts, discount_redemptions, discount_codes, booking_events, customer_notifications, bookings, trainers, trainer_application_events, trainer_documents, trainer_applications, otp_challenges, refresh_tokens, admin_profiles, user_roles, users, outbox_events, audit_log cascade');
    await pool.query(`insert into reward_rules (side) values ('referrer'), ('friend') on conflict do nothing`);
    await pool.query(`update reward_rules set enabled = false, kind = null, flat_off_paise = null, percent_off = null, max_discount_paise = null, valid_days = 30`);
    me = await signIn(app, pool, ME);
    friend = await signIn(app, pool, FRIEND);
    owner = await adminToken(OWNER, 'Ritesh', true, []);
    staff = await adminToken(STAFF, 'Staff', false, []);
  });

  describe('offerings', () => {
    it('is closed to customers and to admins without the switch', async () => {
      await http().get('/v1/admin/offerings').set(as(me)).expect(403);
      await http().get('/v1/admin/offerings').set(as(staff)).expect(403);
      await http().get('/v1/admin/offerings').set(as(owner)).expect(200);
      await http().get('/v1/admin/offerings').expect(401);
    });

    it('a price change is what the app shows and what a booking charges; a service price beats the default', async () => {
      const list = (await http().get('/v1/admin/offerings').set(as(owner)).expect(200)).body;
      expect(list.defaultPrices.scheduled.pricePaise).toBe(150_000);
      const address = await addressFor(me);
      await http().put('/v1/admin/offerings/prices').set(as(owner)).send({ serviceId: null, mode: 'scheduled', pricePaise: 175_000 }).expect(200);
      expect((await http().get('/v1/services').expect(200)).body.find((s: { slug: string }) => s.slug === 'yoga').pricePaise.scheduled).toBe(175_000);
      expect((await book(me, address, 3).expect(201)).body.totalPaise).toBe(175_000);

      const yoga = list.services.find((s: { slug: string }) => s.slug === 'yoga');
      await http().put('/v1/admin/offerings/prices').set(as(owner)).send({ serviceId: yoga.id, mode: 'scheduled', pricePaise: 120_000 }).expect(200);
      expect((await book(me, address, 4).expect(201)).body.totalPaise).toBe(120_000);
      // Earlier bookings keep the price they were made at.
      expect((await pool.query(`select total_paise from bookings order by created_at`)).rows.map((r) => r.total_paise)).toEqual([175_000, 120_000]);
      // Removing the service price falls back to the default.
      await http().put('/v1/admin/offerings/prices').set(as(owner)).send({ serviceId: yoga.id, mode: 'scheduled', pricePaise: null }).expect(200);
      expect((await book(me, address, 5).expect(201)).body.totalPaise).toBe(175_000);
      // The default cannot be removed, and a price must be a sane number.
      await http().put('/v1/admin/offerings/prices').set(as(owner)).send({ serviceId: null, mode: 'scheduled', pricePaise: null }).expect(400);
      await http().put('/v1/admin/offerings/prices').set(as(owner)).send({ serviceId: null, mode: 'scheduled', pricePaise: -5 }).expect(400);
      await http().put('/v1/admin/offerings/prices').set(as(owner)).send({ serviceId: null, mode: 'weekly', pricePaise: 5000 }).expect(400);
      expect((await pool.query(`select count(*)::int as c from audit_log where action = 'catalog.price_set'`)).rows[0].c).toBe(3);
      await pool.query(`update service_prices set is_active = false where service_id is null and mode = 'scheduled'`);
      await pool.query(`insert into service_prices (service_id, mode, price_paise) values (null, 'scheduled', 150000)`);
    });

    it('Duo and Group rules are editable and drive the price', async () => {
      const address = await addressFor(me);
      await http().put('/v1/admin/offerings/participants/duo').set(as(owner)).send({ percent: 180, perHead: false }).expect(200);
      const rules = (await http().get('/v1/services').expect(200)).body[0].participantRules;
      expect(rules.duo).toEqual({ percent: 180, perHead: false });
      expect((await book(me, address, 3, { participant: 'duo' }).expect(201)).body.totalPaise).toBe(270_000);
      const view = (await http().get('/v1/admin/offerings').set(as(owner)).expect(200)).body;
      expect(view.participants.find((p: { participant: string }) => p.participant === 'duo')).toMatchObject({ percent: 180, isPlaceholder: false });
      await http().put('/v1/admin/offerings/participants/duo').set(as(owner)).send({ percent: 0, perHead: false }).expect(400);
      await http().put('/v1/admin/offerings/participants/personal').set(as(owner)).send({ percent: 100, perHead: false }).expect(400);
    });

    it('adds a service and a style, shows them in the app, and hides them when switched off', async () => {
      const made = (await http().post('/v1/admin/offerings/services').set(as(owner)).send({ slug: 'zz-test-pilates', name: 'Pilates', tagline: 'Core and control', durationMinMinutes: 45, durationMaxMinutes: 60, sortOrder: 50 }).expect(201)).body;
      await http().post('/v1/admin/offerings/services').set(as(owner)).send({ slug: 'zz-test-pilates', name: 'Again', durationMinMinutes: 45, durationMaxMinutes: 60 }).expect(400); // web name taken
      await http().post('/v1/admin/offerings/services').set(as(owner)).send({ slug: 'Bad Name!', name: 'X', durationMinMinutes: 45, durationMaxMinutes: 60 }).expect(400);
      await http().post('/v1/admin/offerings/services').set(as(owner)).send({ slug: 'zz-test-short', name: 'X', durationMinMinutes: 60, durationMaxMinutes: 45 }).expect(400);
      const style = (await http().post(`/v1/admin/offerings/services/${made.id}/formats`).set(as(owner)).send({ slug: 'mat-pilates', name: 'Mat Pilates', description: 'On the floor' }).expect(201)).body;
      const shown = (await http().get('/v1/services').expect(200)).body.find((s: { slug: string }) => s.slug === 'zz-test-pilates');
      expect(shown).toMatchObject({ name: 'Pilates', formats: [{ slug: 'mat-pilates', name: 'Mat Pilates' }] });
      expect(shown.pricePaise.scheduled).toBe(150_000); // default price
      const address = await addressFor(me);
      await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'zz-test-pilates', formatSlug: 'mat-pilates', mode: 'scheduled', addressId: address, startsAt: slot(3), idempotencyKey: key() }).expect(201);
      await http().post(`/v1/admin/offerings/services/${made.id}/formats/${style.id}`).set(as(owner)).send({ name: 'Mat Pilates', isActive: false }).expect(200);
      expect((await http().get('/v1/services').expect(200)).body.find((s: { slug: string }) => s.slug === 'zz-test-pilates').formats).toEqual([]);
      await http().post(`/v1/admin/offerings/services/${made.id}`).set(as(owner)).send({ name: 'Pilates', durationMinMinutes: 45, durationMaxMinutes: 60, isActive: false }).expect(200);
      expect((await http().get('/v1/services').expect(200)).body.some((s: { slug: string }) => s.slug === 'zz-test-pilates')).toBe(false);
      await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'zz-test-pilates', formatSlug: 'mat-pilates', mode: 'scheduled', addressId: address, startsAt: slot(4), idempotencyKey: key() }).expect(404);
      await http().post(`/v1/admin/offerings/services/${made.id}/formats/${made.id}`).set(as(owner)).send({ name: 'x' }).expect(404);
      await pool.query(`delete from bookings where service_id = $1`, [made.id]);
    });
  });

  describe('rewards', () => {
    const referredFriend = async () => {
      const code = (await http().get('/v1/referral').set(as(me)).expect(200)).body.code as string;
      await http().post('/v1/referral/apply').set(as(friend)).send({ code }).expect(200);
    };

    it('starts switched off: a referral gives nothing', async () => {
      await referredFriend();
      await book(friend, await addressFor(friend), 3).expect(201);
      expect((await pool.query(`select count(*)::int as c from referral_rewards`)).rows[0].c).toBe(0);
      const view = (await http().get('/v1/admin/rewards').set(as(owner)).expect(200)).body;
      expect(view.rules.every((r: { enabled: boolean }) => !r.enabled)).toBe(true);
      expect(view.stats).toMatchObject({ signedUp: 1, booked: 1, rewardsGiven: 0 });
      await http().get('/v1/admin/rewards').set(as(staff)).expect(403);
    });

    it('gives each side one single-use code on the friend\'s first booking, once only', async () => {
      await http().put('/v1/admin/rewards/referrer').set(as(owner)).send({ enabled: true, kind: 'flat', flatOffPaise: 20_000, percentOff: null, maxDiscountPaise: null, validDays: 30 }).expect(200);
      await http().put('/v1/admin/rewards/friend').set(as(owner)).send({ enabled: true, kind: 'percent', flatOffPaise: null, percentOff: 10, maxDiscountPaise: 15_000, validDays: 14 }).expect(200);
      await referredFriend();
      const addr = await addressFor(friend);
      await book(friend, addr, 3).expect(201);
      await book(friend, addr, 4).expect(201); // a second booking pays nothing more
      const rewards = (await pool.query(`select r.side, c.code, c.assigned_user_id, c.kind, c.max_redemptions, c.applies_to from referral_rewards r join discount_codes c on c.id = r.discount_code_id order by r.side`)).rows;
      expect(rewards).toHaveLength(2);
      expect(rewards.map((r) => r.side)).toEqual(['friend', 'referrer']);
      expect(rewards.every((r) => r.max_redemptions === 1 && r.applies_to === 'session')).toBe(true);
      const notes = (await http().get('/v1/notifications').set(as(me)).expect(200)).body as { title: string; body: string }[];
      expect(notes.some((x) => x.title === 'You earned a referral reward' && x.body.includes('₹200'))).toBe(true);
      // The referrer can use theirs; the friend cannot use the referrer's.
      const referrerCode = rewards.find((r) => r.side === 'referrer')!.code as string;
      const mine = await book(me, await addressFor(me), 5, { discountCode: referrerCode }).expect(201);
      expect(mine.body).toMatchObject({ discountPaise: 20_000, totalPaise: 130_000 });
      await book(friend, addr, 6, { discountCode: referrerCode }).expect(422);
      const view = (await http().get('/v1/admin/rewards').set(as(owner)).expect(200)).body;
      expect(view.issued.map((i: { state: string }) => i.state).sort()).toEqual(['unused', 'used']);
      expect(view.stats.rewardsGiven).toBe(2);
      // Ops can switch an unused reward off.
      const unused = view.issued.find((i: { state: string }) => i.state === 'unused');
      const after = (await http().post(`/v1/admin/rewards/issued/${unused.id}/switch-off`).set(as(owner)).expect(200)).body;
      expect(after.issued.find((i: { id: string }) => i.id === unused.id).state).toBe('switched_off');
    });

    it('10% for both, one use, 15 days: codes show in the app, are emailed, and admin sees made and used', async () => {
      const ten = { enabled: true, kind: 'percent', flatOffPaise: null, percentOff: 10, maxDiscountPaise: null, validDays: 15 };
      // Switched off: the app promises nothing.
      expect((await http().get('/v1/referral').set(as(me)).expect(200)).body).toMatchObject({ offer: { referrer: null, friend: null }, rewards: [] });
      await http().put('/v1/admin/rewards/referrer').set(as(owner)).send(ten).expect(200);
      await http().put('/v1/admin/rewards/friend').set(as(owner)).send(ten).expect(200);
      expect((await http().get('/v1/referral').set(as(me)).expect(200)).body.offer).toEqual({ referrer: { worth: '10% off', validDays: 15 }, friend: { worth: '10% off', validDays: 15 } });
      await pool.query(`update users set verified_email = 'friend-one@zoove.test' where phone_e164 = $1`, [FRIEND]);
      await pool.query(`update users set verified_email = 'me-one@zoove.test' where phone_e164 = $1`, [ME]);
      mail.sent.length = 0;
      await referredFriend();
      const addr = await addressFor(friend);
      await book(friend, addr, 3).expect(201);

      // Both customers see their own code in the app: 10% off, valid about 15 days, unused.
      for (const token of [me, friend]) {
        const mine = (await http().get('/v1/referral').set(as(token)).expect(200)).body.rewards as { code: string; worth: string; state: string; expiresAt: string }[];
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ worth: '10% off', state: 'unused' });
        const days = (new Date(mine[0]!.expiresAt).getTime() - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(14.9);
        expect(days).toBeLessThan(15.1);
      }
      // Both are emailed once, each with their own code.
      await app.get(OutboxWorkerService).runOnce();
      const sent = mail.sent.filter((m) => m.subject.includes('10% off'));
      expect(sent.map((m) => m.to).sort()).toEqual(['friend-one@zoove.test', 'me-one@zoove.test']);
      const meCode = ((await http().get('/v1/referral').set(as(me)).expect(200)).body.rewards[0] as { code: string }).code;
      expect(sent.find((m) => m.to === 'me-one@zoove.test')!.text).toContain(meCode);
      mail.sent.length = 0;
      await app.get(OutboxWorkerService).runOnce();
      expect(mail.sent).toHaveLength(0); // sent once, not again

      // Admin sees it made; after use, sees it used with a date. One use only.
      let view = (await http().get('/v1/admin/rewards').set(as(owner)).expect(200)).body;
      expect(view.issued).toHaveLength(2);
      expect(view.issued.every((i: { state: string; usedAt: string | null; worth: string }) => i.state === 'unused' && i.usedAt === null && i.worth === '10% off')).toBe(true);
      const used = await book(me, await addressFor(me), 5, { discountCode: meCode }).expect(201);
      expect(used.body).toMatchObject({ discountPaise: 15_000, totalPaise: 135_000 });
      await book(me, await addressFor(me), 6, { discountCode: meCode }).expect(422); // already used
      view = (await http().get('/v1/admin/rewards').set(as(owner)).expect(200)).body;
      const row = view.issued.find((i: { code: string }) => i.code === meCode);
      expect(row.state).toBe('used');
      expect(typeof row.usedAt).toBe('string');
      expect((await http().get('/v1/referral').set(as(me)).expect(200)).body.rewards[0].state).toBe('used');
      // Changing the percent only affects later rewards.
      await http().put('/v1/admin/rewards/referrer').set(as(owner)).send({ ...ten, percentOff: 20 }).expect(200);
      expect((await http().get('/v1/referral').set(as(friend)).expect(200)).body.rewards[0].worth).toBe('10% off');
    });

    it('a phone-only customer still gets the code in the app, without an email', async () => {
      const ten = { enabled: true, kind: 'percent', flatOffPaise: null, percentOff: 10, maxDiscountPaise: null, validDays: 15 };
      await http().put('/v1/admin/rewards/referrer').set(as(owner)).send(ten).expect(200);
      await pool.query(`update users set verified_email = null where phone_e164 = $1`, [ME]);
      mail.sent.length = 0;
      await referredFriend();
      await book(friend, await addressFor(friend), 3).expect(201);
      await app.get(OutboxWorkerService).runOnce();
      expect(mail.sent).toHaveLength(0);
      expect((await http().get('/v1/referral').set(as(me)).expect(200)).body.rewards).toHaveLength(1);
      expect((await pool.query(`select count(*)::int as c from outbox_events where event_type = 'referral.reward_granted' and published_at is null`)).rows[0].c).toBe(0);
    });

    it('a reward that fails never blocks the friend\'s booking', async () => {
      await http().put('/v1/admin/rewards/referrer').set(as(owner)).send({ enabled: true, kind: 'flat', flatOffPaise: 20_000, percentOff: null, maxDiscountPaise: null, validDays: 30 }).expect(200);
      await pool.query(`create or replace function zz_boom() returns trigger language plpgsql as $$ begin raise exception 'reward store is down'; end $$`);
      await pool.query(`create trigger zz_boom before insert on referral_rewards for each row execute function zz_boom()`);
      try {
        await referredFriend();
        const booked = await book(friend, await addressFor(friend), 3).expect(201);
        expect(booked.body.status).toBe('matching');
        expect((await pool.query(`select status from referrals`)).rows[0].status).toBe('booked');
        expect((await pool.query(`select count(*)::int as c from referral_rewards`)).rows[0].c).toBe(0);
      } finally {
        await pool.query(`drop trigger zz_boom on referral_rewards`);
        await pool.query(`drop function zz_boom()`);
      }
    });

    it('rejects a half-filled rule when switching on, and keeps a half-filled one off', async () => {
      await http().put('/v1/admin/rewards/referrer').set(as(owner)).send({ enabled: true, kind: 'flat', flatOffPaise: null, percentOff: null, maxDiscountPaise: null, validDays: 30 }).expect(400);
      await http().put('/v1/admin/rewards/referrer').set(as(owner)).send({ enabled: true, kind: null, flatOffPaise: null, percentOff: null, maxDiscountPaise: null, validDays: 30 }).expect(400);
      await http().put('/v1/admin/rewards/referrer').set(as(owner)).send({ enabled: false, kind: 'percent', flatOffPaise: null, percentOff: null, maxDiscountPaise: null, validDays: 30 }).expect(200);
      expect((await pool.query(`select enabled, kind from reward_rules where side = 'referrer'`)).rows[0]).toEqual({ enabled: false, kind: null });
      await http().put('/v1/admin/rewards/cousin').set(as(owner)).send({ enabled: false, kind: null, flatOffPaise: null, percentOff: null, maxDiscountPaise: null, validDays: 30 }).expect(400);
      await http().put('/v1/admin/rewards/friend').set(as(owner)).send({ enabled: true, kind: 'percent', flatOffPaise: null, percentOff: 150, maxDiscountPaise: null, validDays: 30 }).expect(400);
    });
  });

  describe('trainer cancellation', () => {
    async function confirmed(day = 3) {
      const address = await addressFor(me);
      const booking = (await book(me, address, day).expect(201)).body;
      const trainerA = await makeTrainer('Asha');
      const trainerB = await makeTrainer('Bela');
      await http().post(`/v1/admin/sessions/${booking.id}/assign`).set(as(owner)).send({ trainerId: trainerA }).expect(200);
      return { booking, trainerA, trainerB };
    }

    it('assigning shows the trainer\'s first name to the customer; non-ops cannot', async () => {
      const address = await addressFor(me);
      const booking = (await book(me, address, 3).expect(201)).body;
      expect(booking.sessionCode).toMatch(/^ZV-[0-9A-F]{8}$/);
      expect(booking).toMatchObject({ status: 'matching', coach: null, trainerCancelled: false });
      const trainer = await makeTrainer('Asha');
      await http().post(`/v1/admin/sessions/${booking.id}/assign`).set(as(me)).send({ trainerId: trainer }).expect(403);
      await http().post(`/v1/admin/sessions/${booking.id}/assign`).set(as(staff)).send({ trainerId: trainer }).expect(403);
      const detail = (await http().post(`/v1/admin/sessions/${booking.id}/assign`).set(as(owner)).send({ trainerId: trainer }).expect(200)).body;
      expect(detail).toMatchObject({ status: 'confirmed', trainerName: 'Asha Rao' });
      const mine = (await http().get(`/v1/bookings/${booking.id}`).set(as(me)).expect(200)).body;
      expect(mine).toMatchObject({ status: 'confirmed', coach: { name: 'Asha' } });
      await http().post(`/v1/admin/sessions/${booking.id}/assign`).set(as(owner)).send({ trainerId: trainer }).expect(409); // already has a trainer
      await pool.query(`update trainers set status = 'paused' where user_id = $1`, [trainer]);
      const second = (await book(me, address, 4).expect(201)).body;
      await http().post(`/v1/admin/sessions/${second.id}/assign`).set(as(owner)).send({ trainerId: trainer }).expect(400); // paused trainer
    });

    it('a trainer cancelling sends the session back to finding a trainer, tells the customer and ops with the session code', async () => {
      const { booking, trainerA, trainerB } = await confirmed();
      await http().post(`/v1/admin/sessions/${booking.id}/trainer-cancel`).set(as(owner)).send({ reason: 'x' }).expect(400); // reason too short
      const detail = (await http().post(`/v1/admin/sessions/${booking.id}/trainer-cancel`).set(as(owner)).send({ reason: 'Family emergency' }).expect(200)).body;
      expect(detail).toMatchObject({ status: 'rematching', trainerId: null, trainerCancelCount: 1, sessionCode: booking.sessionCode });
      expect(detail.events.map((e: { type: string }) => e.type)).toEqual(['created', 'trainer_assigned', 'trainer_cancelled']);

      const mine = (await http().get(`/v1/bookings/${booking.id}`).set(as(me)).expect(200)).body;
      expect(mine).toMatchObject({ status: 'rematching', coach: null, trainerCancelled: true, canChange: true });
      const notes = (await http().get('/v1/notifications').set(as(me)).expect(200)).body as { title: string; body: string }[];
      const note = notes.find((x) => x.title === 'Your coach had to cancel')!;
      expect(note.body).toContain(booking.sessionCode);
      expect(note.body).toContain('wait');
      expect(note.body).toContain('another time');
      const outbox = (await pool.query(`select payload from outbox_events where event_type = 'booking.trainer_cancelled'`)).rows;
      expect(outbox).toHaveLength(1);
      expect(outbox[0].payload).toMatchObject({ sessionCode: booking.sessionCode, reason: 'Family emergency' });

      // Ops see it at the top of "needs a trainer", and it counts in the summary and the search.
      const needs = (await http().get('/v1/admin/sessions?filter=needs_trainer').set(as(owner)).expect(200)).body;
      expect(needs[0]).toMatchObject({ id: booking.id, status: 'rematching', trainerCancelCount: 1 });
      expect((await http().get('/v1/admin/sessions/summary').set(as(owner)).expect(200)).body).toEqual({ needsTrainer: 1, trainerCancelled: 1, overdue: 0 });
      const found = (await http().get(`/v1/admin/sessions?filter=all&q=${booking.sessionCode.toLowerCase()}`).set(as(owner)).expect(200)).body;
      expect(found.map((s: { id: string }) => s.id)).toEqual([booking.id]);

      // The trainer who cancelled cannot be put back on it; another one can.
      await http().post(`/v1/admin/sessions/${booking.id}/assign`).set(as(owner)).send({ trainerId: trainerA }).expect(400);
      const again = (await http().post(`/v1/admin/sessions/${booking.id}/assign`).set(as(owner)).send({ trainerId: trainerB }).expect(200)).body;
      expect(again).toMatchObject({ status: 'confirmed', trainerName: 'Bela Rao' });
      expect((await http().get('/v1/notifications').set(as(me)).expect(200)).body.some((x: { title: string }) => x.title === 'Coach assigned')).toBe(true);
      expect((await http().get('/v1/admin/sessions/summary').set(as(owner)).expect(200)).body).toEqual({ needsTrainer: 0, trainerCancelled: 0, overdue: 0 });
    });

    it('emails ops with the session code and a link when a trainer cancels', async () => {
      const { booking } = await confirmed();
      mail.sent = [];
      await http().post(`/v1/admin/sessions/${booking.id}/trainer-cancel`).set(as(owner)).send({ reason: 'Family emergency' }).expect(200);
      const worker = app.get(OutboxWorkerService);
      for (let i = 0; i < 3; i += 1) await worker.runOnce();
      const note = mail.sent.find((m) => m.to === 'ops@zoove.test');
      expect(note?.subject).toContain(booking.sessionCode);
      expect(note?.text).toContain('Family emergency');
      expect(note?.text).toContain(`/sessions?code=${booking.sessionCode}`);
    });

    it('moving a confirmed session to a time its trainer is busy sends it back to finding a coach', async () => {
      const address = await addressFor(me);
      const other = await addressFor(friend);
      const a = (await book(me, address, 3).expect(201)).body;
      const b = (await book(friend, other, 4).expect(201)).body;
      const trainer = await makeTrainer('Asha');
      await http().post(`/v1/admin/sessions/${a.id}/assign`).set(as(owner)).send({ trainerId: trainer }).expect(200);
      await http().post(`/v1/admin/sessions/${b.id}/assign`).set(as(owner)).send({ trainerId: trainer }).expect(200);
      // Free slot: the trainer stays.
      expect((await http().post(`/v1/bookings/${a.id}/reschedule`).set(as(me)).send({ startsAt: slot(6) }).expect(201)).body).toMatchObject({ status: 'confirmed' });
      // Busy slot (the trainer's other session): back to finding a coach, and the customer is told.
      const moved = (await http().post(`/v1/bookings/${a.id}/reschedule`).set(as(me)).send({ startsAt: slot(4) }).expect(201)).body;
      expect(moved).toMatchObject({ status: 'rematching', coach: null, trainerCancelled: false });
      expect((await pool.query(`select coach_id from bookings where id = $1`, [a.id])).rows[0].coach_id).toBeNull();
      expect((await http().get('/v1/notifications').set(as(me)).expect(200)).body.some((x: { body: string }) => x.body.includes('not free then'))).toBe(true);
    });

    it('while finding a trainer the customer can wait, reschedule or cancel', async () => {
      const { booking } = await confirmed();
      await http().post(`/v1/admin/sessions/${booking.id}/trainer-cancel`).set(as(owner)).send({ reason: 'Unwell' }).expect(200);
      const moved = (await http().post(`/v1/bookings/${booking.id}/reschedule`).set(as(me)).send({ startsAt: slot(5, 7) }).expect(201)).body;
      expect(moved).toMatchObject({ status: 'rematching', trainerCancelled: true });
      expect(moved.startsAt).toBe(slot(5, 7));
      const cancelled = (await http().post(`/v1/bookings/${booking.id}/cancel`).set(as(me)).expect(201)).body;
      expect(cancelled.status).toBe('cancelled');
      // Gone from the ops queue, and no more cancelling or assigning.
      expect((await http().get('/v1/admin/sessions?filter=needs_trainer').set(as(owner)).expect(200)).body).toEqual([]);
      await http().post(`/v1/admin/sessions/${booking.id}/trainer-cancel`).set(as(owner)).send({ reason: 'again' }).expect(409);
      await http().post(`/v1/admin/sessions/${booking.id}/assign`).set(as(owner)).send({ trainerId: await makeTrainer('Cara') }).expect(409);
    });

    it('a trainer cancelling does not cost the customer their package credit or discount; their own cancel gives the credit back', async () => {
      const pkg = (await http().get('/v1/packages').set(as(me)).expect(200)).body[0] as { id: string; sessionsCount: number };
      const order = (await http().post('/v1/me/packages').set(as(me)).send({ packageId: pkg.id, idempotencyKey: key() }).expect(201)).body;
      await http().post(`/v1/admin/package-orders/${order.id}/mark-paid`).set(as(owner)).send({ method: 'upi', reference: 'UPI1' }).expect(200);
      const address = await addressFor(me);
      const booking = (await book(me, address, 3, { useCredit: true }).expect(201)).body;
      await http().post(`/v1/admin/sessions/${booking.id}/assign`).set(as(owner)).send({ trainerId: await makeTrainer('Asha') }).expect(200);
      await http().post(`/v1/admin/sessions/${booking.id}/trainer-cancel`).set(as(owner)).send({ reason: 'Unwell' }).expect(200);
      const credits = async () => (await http().get('/v1/me/packages').set(as(me)).expect(200)).body.credits.creditsLeft as number;
      expect(await credits()).toBe(pkg.sessionsCount - 1);
      expect((await http().get(`/v1/bookings/${booking.id}`).set(as(me)).expect(200)).body).toMatchObject({ status: 'rematching', paidWithCredit: true });
      await http().post(`/v1/bookings/${booking.id}/cancel`).set(as(me)).expect(201);
      expect(await credits()).toBe(pkg.sessionsCount);
    });

    it('refuses a trainer cancellation for a session that has no trainer, or has started', async () => {
      const address = await addressFor(me);
      const waiting = (await book(me, address, 3).expect(201)).body;
      await http().post(`/v1/admin/sessions/${waiting.id}/trainer-cancel`).set(as(owner)).send({ reason: 'No trainer yet' }).expect(409);
      const { booking } = await confirmed(4);
      await pool.query(`update bookings set starts_at = now() - interval '10 minutes' where id = $1`, [booking.id]);
      await http().post(`/v1/admin/sessions/${booking.id}/trainer-cancel`).set(as(owner)).send({ reason: 'Too late' }).expect(409);
      await http().post(`/v1/admin/sessions/${booking.id}/trainer-cancel`).set(as(staff)).send({ reason: 'Not allowed' }).expect(403);
    });

    it('never gives one trainer two sessions at the same time, and shows full details to ops', async () => {
      const address = await addressFor(me);
      const other = await addressFor(friend);
      const a = (await book(me, address, 3).expect(201)).body;
      const b = (await book(friend, other, 3).expect(201)).body;
      const trainer = await makeTrainer('Asha');
      await http().post(`/v1/admin/sessions/${a.id}/assign`).set(as(owner)).send({ trainerId: trainer }).expect(200);
      await http().post(`/v1/admin/sessions/${b.id}/assign`).set(as(owner)).send({ trainerId: trainer }).expect(409);
      const detail = (await http().get(`/v1/admin/sessions/${a.id}`).set(as(owner)).expect(200)).body;
      expect(detail).toMatchObject({ addressLine: expect.stringContaining('Test Heights'), serviceName: 'Yoga', sessionCode: a.sessionCode });
      const trainers = (await http().get('/v1/admin/sessions/trainers').set(as(owner)).expect(200)).body;
      expect(trainers).toEqual([{ id: trainer, name: 'Asha Rao' }]);
      await http().get(`/v1/admin/sessions/${'0'.repeat(8)}-0000-4000-8000-000000000000`).set(as(owner)).expect(404);
    });
  });
});
