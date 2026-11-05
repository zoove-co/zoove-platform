import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { APP_CONFIG, type Env } from '../config/env';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';
import { sessionCodeOf } from './bookings.service';
import { formatWhen } from './rules';

const BATCH = 50;

// A scheduled session whose start time has passed with no trainer on it is "overdue". We never cancel it for the customer.
// We tell them once, say what they can do (move it or cancel it, and a package credit or discount comes back), and tell ops.
// Moving the session to a new time clears the mark, so a later miss is told again.
@Injectable()
export class OverdueSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OverdueSweep');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly db: DatabaseService, @Inject(APP_CONFIG) private readonly config: Env) {}

  onModuleInit(): void {
    if (this.config.NODE_ENV === 'test' || !this.config.EMAIL_WORKER_ENABLED) return;
    this.timer = setInterval(() => void this.runOnce().catch((error: unknown) => this.logger.warn(`Sweep failed: ${error instanceof Error ? error.message : String(error)}`)), 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Returns how many sessions were marked. Safe to run on several instances at once (skip locked).
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.db.tx(async (client) => {
        const due = await client.query<{ id: string; user_id: string; starts_at: Date; service_name: string }>(
          `select b.id, b.user_id, b.starts_at, s.name as service_name
             from bookings b join services s on s.id = b.service_id
            where b.status in ('matching', 'rematching') and b.starts_at is not null and b.starts_at <= now() and b.overdue_notified_at is null
            order by b.starts_at limit $1 for update of b skip locked`,
          [BATCH],
        );
        for (const row of due.rows) {
          const code = sessionCodeOf(row.id);
          await client.query(`update bookings set overdue_notified_at = now() where id = $1`, [row.id]);
          await client.query(`insert into booking_events (id, booking_id, type, actor, payload) values ($1, $2, 'overdue', 'system', $3)`, [uuidv7(), row.id, JSON.stringify({ startedAt: row.starts_at.toISOString() })]);
          await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'booking.overdue', $3)`, [
            uuidv7(), row.id, JSON.stringify({ bookingId: row.id, sessionCode: code, userId: row.user_id, serviceName: row.service_name, when: formatWhen(row.starts_at) }),
          ]);
          await notifyCustomer(
            client, row.user_id, 'We could not find a coach in time',
            `We are sorry. We could not find a coach for your ${row.service_name} session on ${formatWhen(row.starts_at)} (session ${code}). You can move it to another time, or cancel it. If you cancel, any package credit or discount code is returned to you.`,
            row.id,
          );
        }
        return due.rows.length;
      });
    } finally {
      this.running = false;
    }
  }
}
