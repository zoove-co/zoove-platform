import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { signIn, startApp } from './helpers';

// Needs a Postgres with the project migrations and seed applied. See services/api/README.md.
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const ME = '+919876543210';
const OTHER = '+919812345678';

// A start time in India at HH:MM, `days` days from today.
function slot(days: number, time = '18:00'): string {
  const date = new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);

suite('addresses, slots and bookings', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let token: string;
  let otherToken: string;
  let n = 0;

  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const key = () => `test-key-${Date.now()}-${(n += 1)}`;

  const addAddress = (t: string, pincode = '400050', line = `A-${(n += 1)}, Test Heights`) =>
    http().post('/v1/addresses').set(as(t)).send({ label: 'Home', line, area: 'Bandra West, Mumbai', pincode });

  function bookScheduled(t: string, addressId: string, startsAt: string, idempotencyKey = key()) {
    return http()
      .post('/v1/bookings')
      .set(as(t))
      .send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId, startsAt, idempotencyKey });
  }

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string));
    // Bandra-Khar is "locked" in the seed. Open it for these tests.
    await pool.query(`update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar'`);
  });

  afterAll(async () => {
    await pool.query(`update clusters set status = 'locked', activated_at = null where slug = 'bandra-khar'`);
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate table otp_challenges, refresh_tokens, user_roles, users, outbox_events cascade');
    token = await signIn(app, pool, ME);
    otherToken = await signIn(app, pool, OTHER);
  });

  describe('addresses', () => {
    it('needs sign-in', async () => {
      await http().get('/v1/addresses').expect(401);
    });

    it('makes the first address the default and marks serviceability', async () => {
      const first = await addAddress(token).expect(201);
      expect(first.body).toMatchObject({ isDefault: true, serviceable: true, pincode: '400050', latitude: null });
      const outside = await addAddress(token, '110001').expect(201);
      expect(outside.body).toMatchObject({ isDefault: false, serviceable: false });
      const list = await http().get('/v1/addresses').set(as(token)).expect(200);
      expect(list.body).toHaveLength(2);
      expect(list.body[0].isDefault).toBe(true);
    });

    it('saves the same address once', async () => {
      const a = await addAddress(token, '400050', 'Flat 9, Sea View').expect(201);
      const b = await addAddress(token, '400050', 'flat 9, sea view').expect(201);
      expect(b.body.id).toBe(a.body.id);
      expect((await http().get('/v1/addresses').set(as(token))).body).toHaveLength(1);
    });

    it('validates input', async () => {
      await addAddress(token, '12345').expect(400);
      await http().post('/v1/addresses').set(as(token)).send({ label: 'Home', line: 'x', area: 'Bandra', pincode: '400050' }).expect(400);
      await http().post('/v1/addresses').set(as(token)).send({ label: 'Home', line: 'Flat 9, Sea View', area: 'Bandra', pincode: '400050', latitude: 19.05 }).expect(400);
    });

    it('answers serviceability by pincode', async () => {
      await http().post('/v1/addresses/serviceability').set(as(token)).send({ pincode: '400050' }).expect(200, { serviceable: true });
      await http().post('/v1/addresses/serviceability').set(as(token)).send({ pincode: '400099' }).expect(200, { serviceable: false });
      // A locked cluster does not count.
      await http().post('/v1/addresses/serviceability').set(as(token)).send({ pincode: '400076' }).expect(200, { serviceable: false });
    });

    it('switches the default and promotes another when the default is deleted', async () => {
      const a = (await addAddress(token).expect(201)).body;
      const b = (await addAddress(token).expect(201)).body;
      const switched = await http().put(`/v1/addresses/${b.id}/default`).set(as(token)).expect(200);
      expect(switched.body[0].id).toBe(b.id);
      const afterDelete = await http().delete(`/v1/addresses/${b.id}`).set(as(token)).expect(200);
      expect(afterDelete.body).toHaveLength(1);
      expect(afterDelete.body[0]).toMatchObject({ id: a.id, isDefault: true });
    });

    it('keeps one customer out of another customer addresses', async () => {
      const mine = (await addAddress(token).expect(201)).body;
      const r = await http().delete(`/v1/addresses/${mine.id}`).set(as(otherToken)).expect(404);
      expect(r.body.error.code).toBe('ADDRESS_NOT_FOUND');
      await http().put(`/v1/addresses/${mine.id}/default`).set(as(otherToken)).expect(404);
    });

    it('lets an address go once its only session is in the past', async () => {
      const address = (await addAddress(token).expect(201)).body;
      const b = await bookScheduled(token, address.id, slot(3)).expect(201);
      await pool.query(`update bookings set starts_at = now() - interval '1 day' where id = $1`, [b.body.id]);
      await http().delete(`/v1/addresses/${address.id}`).set(as(token)).expect(200);
    });

    it('refuses to delete an address with an upcoming session', async () => {
      const address = (await addAddress(token).expect(201)).body;
      await bookScheduled(token, address.id, slot(3)).expect(201);
      const r = await http().delete(`/v1/addresses/${address.id}`).set(as(token)).expect(409);
      expect(r.body.error.code).toBe('ADDRESS_IN_USE');
    });
  });

  describe('slots', () => {
    it('lists the eight start times in India time', async () => {
      const response = await http().get('/v1/slots').query({ service: 'yoga', date: isoDate(3) }).set(as(token)).expect(200);
      expect(response.body).toHaveLength(8);
      expect(response.body[0].label).toBe('6:00 AM');
      expect(response.body[0].startsAt).toBe(slot(3, '06:00'));
      expect(response.body[7].label).toBe('7:00 PM');
      expect(response.body.every((s: { available: boolean }) => s.available)).toBe(true);
    });

    it('never offers times in the past', async () => {
      const response = await http().get('/v1/slots').query({ service: 'yoga', date: isoDate(-1) }).set(as(token)).expect(200);
      expect(response.body.every((s: { available: boolean }) => !s.available)).toBe(true);
    });

    it('does not offer beyond the booking horizon', async () => {
      const response = await http().get('/v1/slots').query({ service: 'yoga', date: isoDate(90) }).set(as(token)).expect(200);
      expect(response.body.every((s: { available: boolean }) => !s.available)).toBe(true);
    });

    it('marks a time I already booked', async () => {
      const address = (await addAddress(token).expect(201)).body;
      await bookScheduled(token, address.id, slot(3, '18:00')).expect(201);
      const mine = await http().get('/v1/slots').query({ service: 'yoga', date: isoDate(3) }).set(as(token));
      expect(mine.body.find((s: { label: string }) => s.label === '6:00 PM').available).toBe(false);
      // Someone else is not affected.
      const theirs = await http().get('/v1/slots').query({ service: 'yoga', date: isoDate(3) }).set(as(otherToken));
      expect(theirs.body.find((s: { label: string }) => s.label === '6:00 PM').available).toBe(true);
    });

    it('rejects bad input', async () => {
      await http().get('/v1/slots').query({ service: 'yoga', date: '2026-02-31' }).set(as(token)).expect(400);
      await http().get('/v1/slots').query({ service: 'yoga', date: 'tomorrow' }).set(as(token)).expect(400);
      await http().get('/v1/slots').query({ service: 'nope', date: isoDate(3) }).set(as(token)).expect(404);
    });
  });

  describe('create booking', () => {
    let addressId: string;
    beforeEach(async () => {
      addressId = (await addAddress(token).expect(201)).body.id;
    });

    it('books a scheduled session', async () => {
      const response = await bookScheduled(token, addressId, slot(3)).expect(201);
      expect(response.body).toMatchObject({
        serviceSlug: 'yoga',
        formatName: 'Power Yoga',
        mode: 'scheduled',
        status: 'matching',
        totalPaise: 150000,
        canChange: true,
        coach: null,
        addressLabel: 'Home',
      });
      expect(response.body.whenLabel).toContain('6:00 PM');
      expect(response.body.startsAt).toBe(slot(3));
    });

    it('books an instant session with no start time and the instant price', async () => {
      const response = await http()
        .post('/v1/bookings')
        .set(as(token))
        .send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId, idempotencyKey: key() })
        .expect(201);
      expect(response.body).toMatchObject({ mode: 'instant', status: 'matching', startsAt: null, totalPaise: 189900 });
    });

    it('prices the demo session', async () => {
      const response = await http()
        .post('/v1/bookings')
        .set(as(token))
        .send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'demo', addressId, startsAt: slot(2, '07:00'), idempotencyKey: key() })
        .expect(201);
      expect(response.body).toMatchObject({ mode: 'demo', totalPaise: 50000 });
    });

    it('writes the history and the outbox event in the same transaction', async () => {
      const response = await bookScheduled(token, addressId, slot(3)).expect(201);
      const events = await pool.query(`select type, actor from booking_events where booking_id = $1`, [response.body.id]);
      expect(events.rows).toEqual([{ type: 'created', actor: 'customer' }]);
      const outbox = await pool.query(`select event_type, published_at from outbox_events where aggregate_id = $1`, [response.body.id]);
      expect(outbox.rows).toEqual([{ event_type: 'booking.created', published_at: null }]);
    });

    it('returns the same booking for a retry with the same key', async () => {
      const k = key();
      const first = await bookScheduled(token, addressId, slot(3), k).expect(201);
      const second = await bookScheduled(token, addressId, slot(3), k).expect(201);
      expect(second.body.id).toBe(first.body.id);
      const count = await pool.query('select count(*)::int as n from bookings');
      expect(count.rows[0].n).toBe(1);
    });

    it('refuses a key reused for a different booking', async () => {
      const k = key();
      await bookScheduled(token, addressId, slot(3), k).expect(201);
      const r = await bookScheduled(token, addressId, slot(4), k).expect(422);
      expect(r.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('creates one booking when the same request arrives ten times at once', async () => {
      const k = key();
      const results = await Promise.all(Array.from({ length: 10 }, () => bookScheduled(token, addressId, slot(3), k)));
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      const count = await pool.query('select count(*)::int as n from bookings');
      expect(count.rows[0].n).toBe(1);
    });

    it('lets only one of several different requests for the same time through', async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => bookScheduled(token, addressId, slot(3))));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      const others = results.filter((r) => r.status !== 201);
      expect(others.every((r) => r.status === 409 && r.body.error.code === 'SLOT_CONFLICT')).toBe(true);
    });

    it('refuses a second session at the same time, but allows it after a cancel', async () => {
      const first = await bookScheduled(token, addressId, slot(3)).expect(201);
      const clash = await bookScheduled(token, addressId, slot(3)).expect(409);
      expect(clash.body.error.code).toBe('SLOT_CONFLICT');
      await http().post(`/v1/bookings/${first.body.id}/cancel`).set(as(token)).expect(201);
      await bookScheduled(token, addressId, slot(3)).expect(201);
    });

    it('refuses times that are past, off the slot grid, or too far ahead', async () => {
      for (const startsAt of [slot(-1), slot(3, '06:30'), slot(3, '12:00'), slot(90)]) {
        const r = await bookScheduled(token, addressId, startsAt).expect(409);
        expect(r.body.error.code).toBe('SLOT_UNAVAILABLE');
      }
      const missing = await http()
        .post('/v1/bookings')
        .set(as(token))
        .send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId, idempotencyKey: key() })
        .expect(400);
      expect(missing.body.error.code).toBe('INVALID_REQUEST');
    });

    it('refuses an address outside the service area', async () => {
      const outside = (await addAddress(token, '110001').expect(201)).body;
      const r = await bookScheduled(token, outside.id, slot(3)).expect(422);
      expect(r.body.error.code).toBe('NOT_SERVICEABLE');
    });

    it('refuses someone else address, unknown service and unknown style', async () => {
      const theirs = (await addAddress(otherToken).expect(201)).body;
      expect((await bookScheduled(token, theirs.id, slot(3)).expect(404)).body.error.code).toBe('ADDRESS_NOT_FOUND');
      const body = { mode: 'scheduled', addressId, startsAt: slot(3), idempotencyKey: key() };
      await http().post('/v1/bookings').set(as(token)).send({ ...body, serviceSlug: 'nope', formatSlug: 'x' }).expect(404);
      await http().post('/v1/bookings').set(as(token)).send({ ...body, serviceSlug: 'yoga', formatSlug: 'nope' }).expect(404);
    });

    it('accepts only Personal for now', async () => {
      const r = await http()
        .post('/v1/bookings')
        .set(as(token))
        .send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', participant: 'duo', addressId, startsAt: slot(3), idempotencyKey: key() })
        .expect(400);
      expect(r.body.error.code).toBe('INVALID_REQUEST');
    });

    it('allows several instant bookings (open question 19)', async () => {
      const body = { serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId };
      await http().post('/v1/bookings').set(as(token)).send({ ...body, idempotencyKey: key() }).expect(201);
      await http().post('/v1/bookings').set(as(token)).send({ ...body, idempotencyKey: key() }).expect(201);
    });

    it('needs sign-in', async () => {
      await http().post('/v1/bookings').send({}).expect(401);
    });
  });

  describe('read, cancel and reschedule', () => {
    let addressId: string;
    beforeEach(async () => {
      addressId = (await addAddress(token).expect(201)).body.id;
    });

    it('lists my bookings newest first and nobody else sees them', async () => {
      const a = await bookScheduled(token, addressId, slot(3)).expect(201);
      const b = await bookScheduled(token, addressId, slot(4)).expect(201);
      const mine = await http().get('/v1/bookings').set(as(token)).expect(200);
      expect(mine.body.map((x: { id: string }) => x.id)).toEqual([b.body.id, a.body.id]);
      expect((await http().get('/v1/bookings').set(as(otherToken)).expect(200)).body).toEqual([]);
      await http().get(`/v1/bookings/${a.body.id}`).set(as(otherToken)).expect(404);
      await http().get('/v1/bookings/not-a-uuid').set(as(token)).expect(400);
    });

    it('cancels, and cancelling again changes nothing', async () => {
      const b = await bookScheduled(token, addressId, slot(3)).expect(201);
      const first = await http().post(`/v1/bookings/${b.body.id}/cancel`).set(as(token)).expect(201);
      expect(first.body).toMatchObject({ status: 'cancelled', canChange: false });
      await http().post(`/v1/bookings/${b.body.id}/cancel`).set(as(token)).expect(201);
      const events = await pool.query(`select count(*)::int as n from booking_events where booking_id = $1 and type = 'cancelled'`, [b.body.id]);
      expect(events.rows[0].n).toBe(1);
      await http().post(`/v1/bookings/${b.body.id}/cancel`).set(as(otherToken)).expect(404);
    });

    it('closes changes two hours before a confirmed session', async () => {
      const b = await bookScheduled(token, addressId, slot(3)).expect(201);
      // Confirmed and starting in one hour.
      await pool.query(`update bookings set status = 'confirmed', starts_at = now() + interval '1 hour' where id = $1`, [b.body.id]);
      const read = await http().get(`/v1/bookings/${b.body.id}`).set(as(token)).expect(200);
      expect(read.body.canChange).toBe(false);
      expect((await http().post(`/v1/bookings/${b.body.id}/cancel`).set(as(token)).expect(409)).body.error.code).toBe('CHANGE_WINDOW_CLOSED');
      await http().post(`/v1/bookings/${b.body.id}/reschedule`).set(as(token)).send({ startsAt: slot(5) }).expect(409);
      // Three hours out is still fine.
      await pool.query(`update bookings set starts_at = now() + interval '3 hours' where id = $1`, [b.body.id]);
      await http().post(`/v1/bookings/${b.body.id}/cancel`).set(as(token)).expect(201);
    });

    it('does not let a completed session be cancelled', async () => {
      const b = await bookScheduled(token, addressId, slot(3)).expect(201);
      await pool.query(`update bookings set status = 'completed' where id = $1`, [b.body.id]);
      await http().post(`/v1/bookings/${b.body.id}/cancel`).set(as(token)).expect(409);
    });

    it('reschedules to a free time and refuses a taken one', async () => {
      const a = await bookScheduled(token, addressId, slot(3, '18:00')).expect(201);
      await bookScheduled(token, addressId, slot(3, '19:00')).expect(201);
      const moved = await http().post(`/v1/bookings/${a.body.id}/reschedule`).set(as(token)).send({ startsAt: slot(4, '07:00') }).expect(201);
      expect(moved.body.startsAt).toBe(slot(4, '07:00'));
      expect(moved.body.whenLabel).toContain('7:00 AM');
      const clash = await http().post(`/v1/bookings/${a.body.id}/reschedule`).set(as(token)).send({ startsAt: slot(3, '19:00') }).expect(409);
      expect(clash.body.error.code).toBe('SLOT_CONFLICT');
      const bad = await http().post(`/v1/bookings/${a.body.id}/reschedule`).set(as(token)).send({ startsAt: slot(4, '07:30') }).expect(409);
      expect(bad.body.error.code).toBe('SLOT_UNAVAILABLE');
    });

    it('cannot reschedule an instant booking', async () => {
      const b = await http()
        .post('/v1/bookings')
        .set(as(token))
        .send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', addressId, idempotencyKey: key() })
        .expect(201);
      const r = await http().post(`/v1/bookings/${b.body.id}/reschedule`).set(as(token)).send({ startsAt: slot(3) }).expect(409);
      expect(r.body.error.code).toBe('CHANGE_WINDOW_CLOSED');
    });
  });

  describe('catalog prices', () => {
    it('shows the price of every kind of session', async () => {
      const response = await http().get('/v1/services').expect(200);
      expect(response.body[0].pricePaise).toEqual({ instant: 189900, scheduled: 150000, demo: 50000 });
    });

    it('lets one service override the default price', async () => {
      await pool.query(
        `insert into service_prices (service_id, mode, price_paise) select id, 'scheduled', 170000 from services where slug = 'strength'`,
      );
      try {
        const response = await http().get('/v1/services').expect(200);
        const bySlug = Object.fromEntries(response.body.map((s: { slug: string; pricePaise: unknown }) => [s.slug, s.pricePaise]));
        expect(bySlug.strength.scheduled).toBe(170000);
        expect(bySlug.yoga.scheduled).toBe(150000);
      } finally {
        await pool.query(`delete from service_prices where price_paise = 170000`);
      }
    });
  });
});
