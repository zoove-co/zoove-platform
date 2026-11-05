import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';

import { EVENT_DESTINATIONS, type AnalyticsEvent, type DeliveryOutcome, type EventDestination } from '../src/analytics/analytics-event';
import { EventDispatcherService } from '../src/analytics/event-dispatcher.service';
import { signIn, startApp } from './helpers';

class FakeDestination implements EventDestination {
  readonly name = 'fake';
  received: AnalyticsEvent[] = [];
  failWith: DeliveryOutcome | null = null;
  sendBatch(events: AnalyticsEvent[]): Promise<DeliveryOutcome[]> {
    if (this.failWith) return Promise.resolve(events.map(() => this.failWith as DeliveryOutcome));
    this.received.push(...events);
    return Promise.resolve(events.map(() => ({ ok: true as const })));
  }
}
const fake = new FakeDestination();

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const ME = '+919876543210';
const isoDate = (days: number) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const slot = (days: number, hour = 18) => new Date(`${isoDate(days)}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString();

suite('events sent to outside tools', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let me: string;
  let userId: string;
  let n = 0;
  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const dispatcher = () => app.get(EventDispatcherService);

  beforeAll(async () => {
    ({ app, pool } = await startApp(url as string, (b) => b.overrideProvider(EVENT_DESTINATIONS).useValue([fake])));
    await pool.query(`update clusters set status = 'active', activated_at = now() where slug = 'bandra-khar'`);
    me = await signIn(app, pool, ME);
    userId = (await pool.query<{ id: string }>(`select id from users where phone_e164 = $1`, [ME])).rows[0]!.id;
    await pool.query(`delete from bookings where user_id = $1`, [userId]);
    await pool.query(`delete from outbox_events`);
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function newBooking(days: number): Promise<string> {
    const address = (await http().post('/v1/addresses').set(as(me)).send({ label: 'Home', line: `Flat ${(n += 1)}, Secret Heights`, area: 'Bandra West', pincode: '400050' }).expect(201)).body.id as string;
    return (await http().post('/v1/bookings').set(as(me)).send({ serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId: address, startsAt: slot(days), idempotencyKey: `an-${Date.now()}-${(n += 1)}` }).expect(201)).body.id as string;
  }

  it('sends a booking as booking_confirmed with safe facts only, once', async () => {
    const id = await newBooking(5);
    expect(await dispatcher().runOnce()).toBe(1);
    const e = fake.received.find((x) => x.name === 'booking_confirmed')!;
    expect(e.userId).toBe(userId);
    expect(e.properties).toMatchObject({ booking_id: id, service_slug: 'yoga', mode: 'scheduled', booking_for: 'personal', area: 'Bandra West' });
    expect(typeof e.properties.amount_paise).toBe('number');
    // No phone, email, street address or name may leave.
    const text = JSON.stringify(e);
    expect(text).not.toMatch(/Secret Heights|9876543210|@/);
    // Handled once: a second pass sends nothing.
    expect(await dispatcher().runOnce()).toBe(0);
  });

  it('sends cancellation with who cancelled', async () => {
    const id = await newBooking(6);
    await dispatcher().runOnce();
    await http().post(`/v1/bookings/${id}/cancel`).set(as(me)).expect(201);
    await dispatcher().runOnce();
    const e = fake.received.find((x) => x.name === 'booking_cancelled' && x.properties.booking_id === id)!;
    expect(e.properties.cancelled_by).toBe('customer');
  });

  it('never sends internal events (trainer onboarding, team)', async () => {
    await pool.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values (gen_random_uuid(), 'trainer_application', gen_random_uuid(), 'trainer.application_submitted', '{"email":"x@y.z"}')`);
    const before = fake.received.length;
    await dispatcher().runOnce();
    expect(fake.received.length).toBe(before);
  });

  it('retries a failed send later and keeps going after it recovers', async () => {
    fake.failWith = { ok: false, error: 'http 503', retryable: true };
    const id = await newBooking(7);
    await dispatcher().runOnce();
    const row = (await pool.query(`select d.status, d.attempts from event_deliveries d join outbox_events e on e.id = d.event_id where e.aggregate_id = $1 and e.event_type = 'booking.created'`, [id])).rows[0];
    expect(row).toMatchObject({ status: 'failed', attempts: 1 });
    // Not due yet: nothing is retried straight away.
    fake.failWith = null;
    expect(await dispatcher().runOnce()).toBe(0);
    await pool.query(`update event_deliveries set next_attempt_at = now() - interval '1 second' where status = 'failed'`);
    expect(await dispatcher().runOnce()).toBe(1);
    expect((await pool.query(`select status from event_deliveries d join outbox_events e on e.id = d.event_id where e.aggregate_id = $1 and e.event_type = 'booking.created'`, [id])).rows[0].status).toBe('delivered');
  });

  it('does not send for an account that no longer exists', async () => {
    const lonely = await signIn(app, pool, '+919811122233');
    const lonelyId = (await pool.query<{ id: string }>(`select id from users where phone_e164 = '+919811122233'`)).rows[0]!.id;
    await pool.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values (gen_random_uuid(), 'user', $1, 'referral.reward_granted', '{"side":"friend"}')`, [lonelyId]);
    await pool.query(`update users set status = 'deleted', phone_e164 = null where id = $1`, [lonelyId]);
    const before = fake.received.length;
    await dispatcher().runOnce();
    expect(fake.received.length).toBe(before);
    expect(lonely).toBeTruthy();
  });
});
