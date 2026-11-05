import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { APP_CONFIG, type Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { sessionCodeOf } from './bookings.service';
import { formatWhen } from './rules';

export const REMINDER_MINUTES = 30;
const BATCH = 100;

// Tells a trainer (email and phone) when a session they hold starts within 30 minutes. Once per trainer per start time:
// a moved session or a different trainer gets a fresh reminder. A session accepted less than 30 minutes before the start
// is reminded at once, with the real minutes left.
@Injectable()
export class TrainerReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TrainerReminders');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly db: DatabaseService, @Inject(APP_CONFIG) private readonly config: Env) {}

  onModuleInit(): void {
    if (this.config.NODE_ENV === 'test' || !this.config.EMAIL_WORKER_ENABLED) return;
    this.timer = setInterval(() => void this.runOnce().catch((e: unknown) => this.logger.warn(`Reminders failed: ${e instanceof Error ? e.message : String(e)}`)), 60_000);
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
        const due = await client.query<{ id: string; coach_id: string; starts_at: Date; service_name: string; address_area: string | null }>(
          `select b.id, b.coach_id, b.starts_at, b.address_area, s.name as service_name
             from bookings b join services s on s.id = b.service_id
            where b.status = 'confirmed' and b.coach_id is not null and b.starts_at is not null
              and b.starts_at > $1::timestamptz and b.starts_at <= $1::timestamptz + make_interval(mins => $2)
              and not exists (select 1 from trainer_session_reminders r where r.booking_id = b.id and r.trainer_id = b.coach_id and r.starts_at = b.starts_at)
            order by b.starts_at limit ${BATCH} for update of b skip locked`,
          [now, REMINDER_MINUTES],
        );
        for (const row of due.rows) {
          // The start time is copied inside the database: a JavaScript date would round it to milliseconds and the check above would miss it.
          await client.query(`insert into trainer_session_reminders (booking_id, trainer_id, starts_at) select id, coach_id, starts_at from bookings where id = $1 on conflict do nothing`, [row.id]);
          const minutes = Math.max(1, Math.round((row.starts_at.getTime() - now.getTime()) / 60_000));
          await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'booking', $2, 'trainer.session_reminder', $3)`, [
            uuidv7(), row.id, JSON.stringify({ trainerId: row.coach_id, bookingId: row.id, sessionCode: sessionCodeOf(row.id), serviceName: row.service_name, when: formatWhen(row.starts_at), area: row.address_area ?? '', minutes }),
          ]);
        }
        return due.rows.length;
      });
    } finally {
      this.running = false;
    }
  }
}
