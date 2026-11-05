import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { APP_CONFIG, type Env } from '../config/env';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import { sessionCodeOf } from './bookings.service';
import { DISPATCH_WAVES, INSTANT_GIVE_UP_MINUTES, type WaveScope } from './dispatch.rules';
import { formatWhen } from './rules';

const BATCH = 50;
const TOP_UP_BATCH = 200; // newest first, so a long tail of old unfilled sessions can never starve a new one

export const ALERT_ALL_KEY = 'dispatch_alert_all';
// Ops switch: true = alert every eligible trainer in the city at once; false (default) = widening waves.
export async function alertAllSwitch(client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ value?: unknown }> }> }): Promise<boolean> {
  const r = await client.query(`select value from app_settings where key = $1`, [ALERT_ALL_KEY]);
  return r.rows[0]?.value === true;
}

type OpenSession = {
  id: string; user_id: string; mode: string; starts_at: Date | null; address_pincode: string | null; address_area: string | null;
  dispatch_started_at: Date; dispatch_wave: number; unfilled_notified_at: Date | null; service_slug: string; service_name: string;
};

// Offers every open session to trainers in widening waves (same pincode, then same cluster, then everyone who teaches the
// service), skipping trainers who already dropped it or are busy then. A wave nobody can take moves straight on to the next.
// An instant session still open after the give-up time is not cancelled: the customer is told once and can pick a date or cancel.
@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Dispatch');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly db: DatabaseService, @Inject(APP_CONFIG) private readonly config: Env) {}

  onModuleInit(): void {
    if (this.config.NODE_ENV === 'test' || !this.config.EMAIL_WORKER_ENABLED) return;
    this.timer = setInterval(() => void this.runOnce().catch((e: unknown) => this.logger.warn(`Dispatch failed: ${e instanceof Error ? e.message : String(e)}`)), 30_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Returns how many trainer alerts were made. Safe on several instances at once (skip locked).
  async runOnce(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.db.tx(async (client) => {
        const everyone = await alertAllSwitch(client);
        const open = await client.query<OpenSession>(
          `select b.id, b.user_id, b.mode, b.starts_at, b.address_pincode, b.address_area, b.dispatch_started_at, b.dispatch_wave, b.unfilled_notified_at, s.slug as service_slug, s.name as service_name
             from bookings b join services s on s.id = b.service_id
            where b.status in ('matching', 'rematching') and b.dispatch_started_at is not null and (b.starts_at is null or b.starts_at > $2)
              and (b.dispatch_wave < $1 or (b.mode = 'instant' and b.unfilled_notified_at is null))
            order by b.dispatch_started_at limit ${BATCH} for update of b skip locked`,
          [DISPATCH_WAVES.length, now],
        );
        let alerts = 0;
        for (const session of open.rows) alerts += await this.advance(client, session, now, everyone);
        alerts += await this.topUp(client, now, open.rows.map((r) => r.id));
        return alerts;
      });
    } finally {
      this.running = false;
    }
  }

  // Sessions that finished every wave and are still open: offer them to trainers who qualify only now (approved after the
  // session was booked, or free at that time since). Trainers already alerted are skipped, so nobody hears twice.
  private async topUp(client: import('pg').PoolClient, now: Date, skip: string[]): Promise<number> {
    const rows = await client.query<OpenSession>(
      `select b.id, b.user_id, b.mode, b.starts_at, b.address_pincode, b.address_area, b.dispatch_started_at, b.dispatch_wave, b.unfilled_notified_at, s.slug as service_slug, s.name as service_name
         from bookings b join services s on s.id = b.service_id
        where b.status in ('matching', 'rematching') and b.dispatch_started_at is not null and (b.starts_at is null or b.starts_at > $2)
          and b.dispatch_wave >= $1 and not (b.id = any($3::uuid[]))
        order by b.dispatch_started_at desc limit ${TOP_UP_BATCH} for update of b skip locked`,
      [DISPATCH_WAVES.length, now, skip],
    );
    let alerts = 0;
    for (const s of rows.rows) alerts += await this.alertWave(client, s, DISPATCH_WAVES.length, 'city');
    return alerts;
  }

  private async advance(client: import('pg').PoolClient, s: OpenSession, now: Date, everyone: boolean): Promise<number> {
    const elapsedMinutes = (now.getTime() - s.dispatch_started_at.getTime()) / 60_000;
    const target = DISPATCH_WAVES.filter((w) => w.afterMinutes <= elapsedMinutes).length;
    let wave = s.dispatch_wave;
    let alerts = 0;
    let lastWaveEmpty = false;
    if (everyone && wave < DISPATCH_WAVES.length) {
      // Ops switched on "alert every trainer at once": skip the waves and offer it to the whole city now.
      alerts += await this.alertWave(client, s, DISPATCH_WAVES.length, 'city');
      wave = DISPATCH_WAVES.length;
    }
    while (wave < DISPATCH_WAVES.length && (wave < target || lastWaveEmpty)) {
      wave += 1;
      const made = await this.alertWave(client, s, wave, DISPATCH_WAVES[wave - 1]!.scope);
      alerts += made;
      lastWaveEmpty = made === 0;
    }
    if (wave !== s.dispatch_wave) await client.query(`update bookings set dispatch_wave = $2 where id = $1`, [s.id, wave]);

    if (s.mode === 'instant' && wave >= DISPATCH_WAVES.length && s.unfilled_notified_at === null && elapsedMinutes >= INSTANT_GIVE_UP_MINUTES) {
      await this.markUnfilled(client, s);
    }
    return alerts;
  }

  private async alertWave(client: import('pg').PoolClient, s: OpenSession, wave: number, scope: WaveScope): Promise<number> {
    const scopeSql =
      scope === 'pincode' ? `and ta.address_pincode is not null and ta.address_pincode = $5`
      : scope === 'cluster' ? `and ta.address_pincode in (select cp.pincode from cluster_pincodes cp where cp.cluster_id in (select cluster_id from cluster_pincodes where pincode = $5))`
      : '';
    // $5 is only used by the first two scopes; Postgres needs every parameter to be used, so the city scope passes it in a no-op.
    const noop = scope === 'city' ? `and $5::text is not distinct from $5::text` : '';
    const candidates = await client.query<{ user_id: string }>(
      `select t.user_id
         from trainers t join trainer_applications ta on ta.id = t.application_id
        where t.status = 'active' and t.user_id <> $2
          and (cardinality(ta.specialties) = 0 or $3 = any(ta.specialties))
          and not exists (select 1 from job_alerts a where a.booking_id = $1 and a.trainer_id = t.user_id)
          and not exists (select 1 from booking_events e where e.booking_id = $1 and e.type in ('trainer_cancelled', 'trainer_no_show') and e.payload->>'trainerId' = t.user_id::text)
          and ($4::timestamptz is null or not exists (select 1 from bookings x where x.coach_id = t.user_id and x.status = 'confirmed' and x.starts_at = $4))
          ${scopeSql} ${noop}`,
      [s.id, s.user_id, s.service_slug, s.starts_at, s.address_pincode],
    );
    const code = sessionCodeOf(s.id);
    for (const c of candidates.rows) {
      await client.query(`insert into job_alerts (booking_id, trainer_id, wave) values ($1, $2, $3) on conflict do nothing`, [s.id, c.user_id, wave]);
      await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'trainer.job_available', $3)`, [
        uuidv7(), s.id, JSON.stringify({ trainerId: c.user_id, bookingId: s.id, sessionCode: code, serviceName: s.service_name, when: s.starts_at ? formatWhen(s.starts_at) : 'as soon as possible', area: s.address_area ?? '', wave }),
      ]);
    }
    if (candidates.rows.length > 0) {
      await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'dispatch_wave', 'system', $3)`, [uuidv7(), s.id, JSON.stringify({ wave, scope, trainers: candidates.rows.length })]);
    }
    return candidates.rows.length;
  }

  private async markUnfilled(client: import('pg').PoolClient, s: OpenSession): Promise<void> {
    const code = sessionCodeOf(s.id);
    await client.query(`update bookings set unfilled_notified_at = now() where id = $1`, [s.id]);
    await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'unfilled', 'system', '{}')`, [uuidv7(), s.id]);
    await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'booking.unfilled', $3)`, [
      uuidv7(), s.id, JSON.stringify({ bookingId: s.id, sessionCode: code, userId: s.user_id, serviceName: s.service_name }),
    ]);
    await notifyCustomer(
      client, s.user_id, 'We could not find a coach right now',
      `We are sorry. No coach could take your ${s.service_name} session (session ${code}) as soon as you asked. You can pick another date and time for it, or cancel. If you cancel, any package credit or discount code is returned to you. You can also keep waiting and we will keep trying.`,
      s.id,
    );
  }
}
