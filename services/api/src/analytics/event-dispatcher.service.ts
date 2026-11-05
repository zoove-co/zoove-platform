import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { ERROR_REPORTER, type ErrorReporter } from '../monitoring/error-reporter';
import { EVENT_DESTINATIONS, type AnalyticsEvent, type EventDestination } from './analytics-event';
import { EVENT_CATALOG, type Aggregate } from './event-catalog';
import { loadFacts } from './event-facts';

const BATCH = 100;
const MAX_ATTEMPTS = 8;

type Row = { id: string; aggregate_id: string; event_type: string; payload: Record<string, unknown>; created_at: Date; attempts: number | null };

// Reads the outbox and hands each business event to every configured destination, keeping separate progress per
// destination (table event_deliveries). With no destination configured it does nothing and leaves everything waiting,
// so switching CleverTap on later also sends the history.
@Injectable()
export class EventDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('EventDispatcher');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: Env,
    @Inject(EVENT_DESTINATIONS) private readonly destinations: EventDestination[],
    @Optional() @Inject(ERROR_REPORTER) private readonly reporter?: ErrorReporter,
  ) {}

  onModuleInit(): void {
    if (this.config.NODE_ENV === 'test' || this.destinations.length === 0) return;
    this.timer = setInterval(() => void this.runOnce().catch((e: unknown) => this.logger.warn(`Dispatch failed: ${e instanceof Error ? e.message : String(e)}`)), 10_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass over every destination. Returns how many events were sent. Safe to run on several instances at once. */
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      let sent = 0;
      for (const destination of this.destinations) sent += await this.dispatch(destination);
      return sent;
    } finally {
      this.running = false;
    }
  }

  private async dispatch(destination: EventDestination): Promise<number> {
    return this.db.tx(async (client) => {
      // New events (no delivery row yet) and failed ones whose retry time has come.
      const due = await client.query<Row>(
        `select e.id, e.aggregate_id, e.event_type, e.payload, e.created_at, d.attempts
           from outbox_events e left join event_deliveries d on d.event_id = e.id and d.destination = $1
          where e.event_type = any($2) and (d.event_id is null or (d.status = 'failed' and d.attempts < $3 and d.next_attempt_at <= now()))
          order by e.created_at limit $4 for update of e skip locked`,
        [destination.name, Object.keys(EVENT_CATALOG), MAX_ATTEMPTS, BATCH],
      );
      if (due.rows.length === 0) return 0;

      // Facts come from our tables, one query per kind of thing.
      const byAggregate = new Map<Aggregate, Set<string>>();
      for (const row of due.rows) {
        const entry = EVENT_CATALOG[row.event_type];
        if (entry) (byAggregate.get(entry.aggregate) ?? byAggregate.set(entry.aggregate, new Set()).get(entry.aggregate)!).add(row.aggregate_id);
      }
      const facts = new Map<string, Awaited<ReturnType<typeof loadFacts>>>();
      for (const [aggregate, ids] of byAggregate) facts.set(aggregate, await loadFacts(client, aggregate, [...ids]));

      const toSend: { row: Row; event: AnalyticsEvent }[] = [];
      const skipped: Row[] = [];
      for (const row of due.rows) {
        const entry = EVENT_CATALOG[row.event_type]!;
        const fact = facts.get(entry.aggregate)?.get(row.aggregate_id);
        // No user (deleted account, missing row): nothing to attach it to, so it is never sent.
        if (!fact) {
          skipped.push(row);
          continue;
        }
        toSend.push({ row, event: { id: row.id, name: entry.name, userId: fact.userId, occurredAt: row.created_at, properties: { ...fact.properties, ...(entry.fromPayload?.(row.payload) ?? {}) } } });
      }

      for (const row of skipped) await this.record(client, row.id, destination.name, 'skipped', row.attempts ?? 0, null, 0);

      if (toSend.length > 0) {
        let outcomes;
        try {
          outcomes = await destination.sendBatch(toSend.map((t) => t.event));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          outcomes = toSend.map(() => ({ ok: false as const, error: message, retryable: true }));
        }
        for (const [i, { row }] of toSend.entries()) {
          const outcome = outcomes[i] ?? { ok: false as const, error: 'no result', retryable: true };
          if (outcome.ok) {
            await this.record(client, row.id, destination.name, 'delivered', (row.attempts ?? 0) + 1, null, 0);
            continue;
          }
          const attempts = (row.attempts ?? 0) + 1;
          const last = !outcome.retryable || attempts >= MAX_ATTEMPTS;
          this.logger.warn(`${destination.name}: event ${row.event_type} ${row.id} failed (attempt ${attempts}): ${outcome.error}`);
          if (last) this.reporter?.capture(new Error(`${destination.name} delivery gave up: ${outcome.error}`), { path: `analytics:${row.event_type}` });
          await this.record(client, row.id, destination.name, 'failed', last ? MAX_ATTEMPTS : attempts, outcome.error, Math.min(3600, 30 * 2 ** attempts));
        }
      }
      return toSend.length;
    });
  }

  private async record(client: { query: DatabaseService['query'] }, eventId: string, destination: string, status: 'delivered' | 'skipped' | 'failed', attempts: number, error: string | null, retryInSeconds: number): Promise<void> {
    await client.query(
      `insert into event_deliveries (event_id, destination, status, attempts, last_error, next_attempt_at, updated_at)
       values ($1, $2, $3, $4, $5, now() + ($6 || ' seconds')::interval, now())
       on conflict (event_id, destination) do update set status = excluded.status, attempts = excluded.attempts, last_error = excluded.last_error,
         next_attempt_at = excluded.next_attempt_at, updated_at = now()`,
      [eventId, destination, status, attempts, error ? error.slice(0, 500) : null, retryInSeconds],
    );
  }
}
