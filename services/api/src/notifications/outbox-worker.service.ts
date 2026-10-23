import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { EmailProvider, type EmailMessage } from '../email/email.provider';
import { approvedEmail, changesEmail, opsNewApplicationEmail, receivedEmail, rejectedEmail } from './trainer-emails';

type OutboxRow = { id: string; aggregate_id: string; event_type: string; payload: Record<string, unknown>; attempts: number };

type ApplicationInfo = { first_name: string | null; last_name: string | null; email: string | null; phone_e164: string | null; review_note: string | null };

const HANDLED = ['trainer.application_submitted', 'trainer.application_approved', 'trainer.application_rejected', 'trainer.application_changes_requested'];
const MAX_ATTEMPTS = 10;
const BATCH = 10;

// Reads events from the outbox table and turns them into emails. Only claims event types it handles,
// so other consumers (analytics later) still see everything else. Retries use a growing delay.
@Injectable()
export class OutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OutboxWorker');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly email: EmailProvider,
    @Inject(APP_CONFIG) private readonly config: Env,
  ) {}

  onModuleInit(): void {
    if (this.config.NODE_ENV === 'test' || !this.config.EMAIL_WORKER_ENABLED) return;
    this.timer = setInterval(() => void this.runOnce(), 5_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Returns how many events were handled. Safe to call from several instances at once (skip locked).
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.db.tx(async (client) => {
        const claimed = await client.query<OutboxRow>(
          `select id, aggregate_id, event_type, payload, attempts from outbox_events
            where published_at is null and attempts < $1 and next_attempt_at <= now() and event_type = any($2)
            order by created_at limit $3 for update skip locked`,
          [MAX_ATTEMPTS, HANDLED, BATCH],
        );
        for (const event of claimed.rows) {
          try {
            await this.handle(event);
            await client.query(`update outbox_events set published_at = now(), last_error = null where id = $1`, [event.id]);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Event ${event.event_type} ${event.id} failed (attempt ${event.attempts + 1}): ${message}`);
            await client.query(
              `update outbox_events set attempts = attempts + 1, last_error = $2,
                      next_attempt_at = now() + (least(3600, 30 * power(2, attempts)) || ' seconds')::interval where id = $1`,
              [event.id, message.slice(0, 500)],
            );
          }
        }
        return claimed.rows.length;
      });
    } finally {
      this.running = false;
    }
  }

  private async handle(event: OutboxRow): Promise<void> {
    const info = await this.db.query<ApplicationInfo>(
      `select a.first_name, a.last_name, a.email, coalesce(a.phone_e164, u.phone_e164) as phone_e164, a.review_note
         from trainer_applications a join users u on u.id = a.user_id where a.id = $1`,
      [event.aggregate_id],
    );
    const app = info.rows[0];
    if (!app) return; // application no longer exists: nothing to tell anyone

    const firstName = app.first_name ?? 'there';
    const ctx = { firstName, statusUrl: this.config.TRAINER_SITE_URL, note: app.review_note };
    const messages: EmailMessage[] = [];

    if (event.event_type === 'trainer.application_submitted') {
      const resubmission = event.payload.resubmission === true;
      if (app.email) messages.push(receivedEmail(app.email, ctx, resubmission));
      const name = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.phone_e164 || app.email || 'A trainer';
      for (const ops of this.config.OPS_NOTIFY_EMAILS.split(',').map((value) => value.trim()).filter(Boolean)) {
        messages.push(opsNewApplicationEmail(ops, name, app.phone_e164 ?? app.email ?? 'no contact', `${this.config.ADMIN_URL}/trainers/${event.aggregate_id}`, resubmission));
      }
    } else if (app.email) {
      if (event.event_type === 'trainer.application_approved') messages.push(approvedEmail(app.email, ctx));
      if (event.event_type === 'trainer.application_rejected') messages.push(rejectedEmail(app.email, ctx));
      if (event.event_type === 'trainer.application_changes_requested') messages.push(changesEmail(app.email, ctx));
    }
    for (const message of messages) await this.email.send(message);
  }
}
