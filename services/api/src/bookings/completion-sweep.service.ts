import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { sessionCodeOf } from './bookings.service';
import { COMPLETION_GRACE_MINUTES } from './dispatch.rules';
import { formatWhen } from './rules';

const BATCH = 50;

// A confirmed session whose time has passed and that nobody closed is told to ops once. We never close it automatically:
// whether the session really happened is a fact only the trainer or ops can confirm.
@Injectable()
export class CompletionSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CompletionSweep');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly db: DatabaseService, @Inject(APP_CONFIG) private readonly config: Env) {}

  onModuleInit(): void {
    if (this.config.NODE_ENV === 'test' || !this.config.EMAIL_WORKER_ENABLED) return;
    this.timer = setInterval(() => void this.runOnce().catch((e: unknown) => this.logger.warn(`Sweep failed: ${e instanceof Error ? e.message : String(e)}`)), 5 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.db.tx(async (client) => {
        const due = await client.query<{ id: string; starts_at: Date; service_name: string; trainer_name: string | null }>(
          `select b.id, b.starts_at, s.name as service_name,
                  (select ta.first_name from trainers t join trainer_applications ta on ta.id = t.application_id where t.user_id = b.coach_id) as trainer_name
             from bookings b join services s on s.id = b.service_id
            where b.status = 'confirmed' and b.starts_at is not null and b.completion_flagged_at is null
              and b.starts_at <= $1::timestamptz - make_interval(mins => $2)
            order by b.starts_at limit ${BATCH} for update of b skip locked`,
          [now, COMPLETION_GRACE_MINUTES],
        );
        for (const row of due.rows) {
          await client.query(`update bookings set completion_flagged_at = now() where id = $1`, [row.id]);
          await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values (gen_random_uuid(), 'booking', $1, 'booking.completion_open', $2)`, [
            row.id, JSON.stringify({ sessionCode: sessionCodeOf(row.id), serviceName: row.service_name, when: formatWhen(row.starts_at), trainerName: row.trainer_name ?? 'the trainer' }),
          ]);
        }
        return due.rows.length;
      });
    } finally {
      this.running = false;
    }
  }
}
