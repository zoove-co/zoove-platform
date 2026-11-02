import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import request from 'supertest';

import { signIn, startApp } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const ME = '+919876543210';
const OTHER = '+919812345678';
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number, time = '18:00') => new Date(`${isoDate(days)}T${time}:00+05:30`).toISOString();

suite('home, notifications, streak', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let token: string;
  let otherToken: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function addressFor(t: string) {
    const response = await http().post('/v1/addresses').set(as(t)).send({ label: 'Home', line: `A-${(n += 1)}, Test Heights`, area: 'Bandra West', pincode: '400050' }).expect(201);
    return response.body.id as string;
  }
  const book = (t: string, addressId: string, startsAt: string) =>
    http().post('/v1/bookings').set(as(t)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId, startsAt, idempotencyKey: `cust-key-${Date.now()}-${(n += 1)}` });

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string));
    await pool.query(`update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar'`);
  });
  afterAll(async () => {
    await pool.query(`update clusters set status = 'locked', activated_at = null where slug = 'bandra-khar'`);
    await app.close();
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query('truncate table customer_notifications, otp_challenges, refresh_tokens, user_roles, users, outbox_events cascade');
    token = await signIn(app, pool, ME);
    otherToken = await signIn(app, pool, OTHER);
  });

  it('needs sign-in', async () => {
    for (const path of ['/v1/home', '/v1/streak', '/v1/notifications', '/v1/coaches/past', '/v1/packages']) {
      await http().get(path).expect(401);
    }
  });

  it('home for a brand-new customer is empty but complete', async () => {
    const home = await http().get('/v1/home').set(as(token)).expect(200);
    expect(home.body).toMatchObject({
      customerFirstName: null,
      locationLabel: null,
      locationServiceable: true,
      hasUnreadNotifications: false,
      upcomingSession: null,
      weekly: { done: 0, goal: 3 },
    });
    expect(home.body.services.map((s: { slug: string }) => s.slug).sort()).toEqual(['pilates', 'strength', 'yoga', 'zumba']);
    expect(home.body.instant.etaHours).toBe(4);
    expect(Number.isInteger(home.body.scheduled.pricePaise)).toBe(true);
  });

  it('a booking shows on Home and creates one notification; reading clears the dot; others never see it', async () => {
    await http().patch('/v1/me').set(as(token)).send({ firstName: 'Asha' }).expect(200);
    const address = await addressFor(token);
    const booked = await book(token, address, slot(3)).expect(201);

    const home = await http().get('/v1/home').set(as(token)).expect(200);
    expect(home.body).toMatchObject({ customerFirstName: 'Asha', locationLabel: 'Home · Bandra West', locationServiceable: true, hasUnreadNotifications: true });
    expect(home.body.upcomingSession).toMatchObject({ id: booked.body.id, serviceName: 'Yoga', status: 'matching' });

    const list = await http().get('/v1/notifications').set(as(token)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ title: 'Booking received', read: false, bookingId: booked.body.id });
    expect((await http().get('/v1/notifications').set(as(otherToken)).expect(200)).body).toEqual([]);

    await http().post('/v1/notifications/read').set(as(token)).expect(204);
    const after = await http().get('/v1/notifications').set(as(token)).expect(200);
    expect(after.body[0].read).toBe(true);
    expect((await http().get('/v1/home').set(as(token)).expect(200)).body.hasUnreadNotifications).toBe(false);

    await http().post(`/v1/bookings/${booked.body.id}/cancel`).set(as(token)).expect(201);
    const final = await http().get('/v1/notifications').set(as(token)).expect(200);
    expect(final.body.map((x: { title: string }) => x.title)).toEqual(['Booking cancelled', 'Booking received']);
    expect((await http().get('/v1/home').set(as(token)).expect(200)).body.upcomingSession).toBeNull();
  });

  it('streak is derived from bookings (India time) and counts consecutive weeks', async () => {
    const address = await addressFor(token);
    const booked = await book(token, address, slot(2)).expect(201);

    let streak = (await http().get('/v1/streak').set(as(token)).expect(200)).body;
    expect(streak.weekDays).toHaveLength(7);
    expect(streak.weekDays[0].weekday).toBe('Mon');
    expect(streak).toMatchObject({ totalSessions: 0, weekStreak: 0, weeklyGoal: 3, sessionsThisWeek: 0 });

    // The trainer flow does not exist yet, so finish sessions directly: one this week and two in earlier weeks.
    await pool.query(`update bookings set status = 'completed', starts_at = $2 where id = $1`, [booked.body.id, new Date(Date.now() - 6 * 3_600_000)]);
    await pool.query(
      `insert into bookings (id, user_id, service_id, format_id, mode, address_id, address_label, address_line, starts_at, status, total_paise, idempotency_key, request_fingerprint)
       select gen_random_uuid(), b.user_id, b.service_id, b.format_id, 'scheduled', b.address_id, b.address_label, b.address_line, b.starts_at - interval '7 days', 'completed', 100, 'old-key-' || g, 'x'
         from bookings b, generate_series(1, 2) g where b.id = $1`,
      [booked.body.id],
    );
    streak = (await http().get('/v1/streak').set(as(token)).expect(200)).body;
    expect(streak.totalSessions).toBe(3);
    expect(streak.focusAreas).toEqual([{ serviceSlug: 'yoga', serviceName: 'Yoga', sessions: 3 }]);
    expect(streak.recentSessions).toHaveLength(3);
    expect(streak.weekStreak).toBeGreaterThanOrEqual(1);
  });

  it('past coaches and packages are empty until those features exist', async () => {
    expect((await http().get('/v1/coaches/past').set(as(token)).expect(200)).body).toEqual([]);
    expect((await http().get('/v1/packages').set(as(token)).expect(200)).body).toEqual([]);
  });
});
