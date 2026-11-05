import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { APP_CONFIG, type Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { EmailProvider, type EmailMessage } from '../email/email.provider';
import { ERROR_REPORTER, type ErrorReporter } from '../monitoring/error-reporter';
import { referralRewardEmail } from './customer-emails';
import { CustomerMessageService } from './customer-message.service';
import { jobAssignedEmail, jobAvailableEmail, jobCancelledEmail, jobMovedEmail } from './trainer-job-emails';
import { packageExpiredOpsEmail, partyRequestedEmail, sessionNotClosedEmail, sessionOverdueEmail, sessionUnfilledEmail, teamInviteEmail, trainerCancelledEmail } from './team-emails';
import { approvedEmail, changesEmail, opsNewApplicationEmail, receivedEmail, rejectedEmail } from './trainer-emails';

type OutboxRow = { id: string; aggregate_id: string; event_type: string; payload: Record<string, unknown>; attempts: number };

type ApplicationInfo = { first_name: string | null; last_name: string | null; email: string | null; phone_e164: string | null; review_note: string | null };

const HANDLED = ['trainer.application_submitted', 'trainer.application_approved', 'trainer.application_rejected', 'trainer.application_changes_requested', 'team.member_invited', 'party.requested', 'booking.trainer_cancelled', 'booking.overdue', 'referral.reward_granted', 'trainer.job_assigned', 'trainer.job_moved', 'trainer.job_cancelled', 'trainer.job_available', 'booking.unfilled', 'booking.completion_open', 'package.expired', 'customer.notify'];
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
    private readonly customerMessages: CustomerMessageService,
    @Inject(APP_CONFIG) private readonly config: Env,
    @Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter,
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
            await this.handle(event, client);
            await client.query(`update outbox_events set published_at = now(), last_error = null where id = $1`, [event.id]);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Event ${event.event_type} ${event.id} failed (attempt ${event.attempts + 1}): ${message}`);
            // Report only when the last retry fails: a notification that is lost for good is worth a human's attention.
            if (event.attempts + 1 >= MAX_ATTEMPTS) this.reporter.capture(error, { path: `outbox:${event.event_type}` });
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

  private opsEmails(): string[] {
    return this.config.OPS_NOTIFY_EMAILS.split(',').map((value) => value.trim()).filter(Boolean);
  }

  private async handle(event: OutboxRow, client: PoolClient): Promise<void> {
    if (event.event_type === 'team.member_invited') {
      const invite = event.payload as { email?: string; name?: string; jobTitle?: string; invitedBy?: string };
      if (!invite.email) return;
      await this.email.send(teamInviteEmail(invite.email, { name: invite.name ?? '', jobTitle: invite.jobTitle ?? 'a team member', invitedBy: invite.invitedBy ?? 'The Zoove team' }, this.config.ADMIN_URL));
      return;
    }
    if (event.event_type === 'party.requested') {
      const p = event.payload as { name?: string; occasion?: string; guests?: number; when?: string; where?: string; phone?: string };
      for (const ops of this.config.OPS_NOTIFY_EMAILS.split(',').map((value) => value.trim()).filter(Boolean)) {
        await this.email.send(partyRequestedEmail(ops, { name: p.name ?? 'A customer', occasion: p.occasion ?? 'party', guests: p.guests ?? 0, when: p.when ?? '', where: p.where ?? '', phone: p.phone ?? '' }, `${this.config.ADMIN_URL}/parties`));
      }
      return;
    }
    if (event.event_type === 'booking.trainer_cancelled') {
      const p = event.payload as { bookingId?: string; sessionCode?: string; serviceName?: string; when?: string; reason?: string };
      for (const ops of this.config.OPS_NOTIFY_EMAILS.split(',').map((value) => value.trim()).filter(Boolean)) {
        await this.email.send(trainerCancelledEmail(ops, { sessionCode: p.sessionCode ?? '', serviceName: p.serviceName ?? 'a', when: p.when ?? '', reason: p.reason ?? '' }, `${this.config.ADMIN_URL}/sessions?code=${encodeURIComponent(p.sessionCode ?? '')}`));
      }
      return;
    }
    if (event.event_type === 'customer.notify') {
      const p = event.payload as { userId?: string; title?: string; body?: string; bookingId?: string | null };
      if (!p.userId || !p.title || !p.body) return;
      await this.customerMessages.deliver(client, event.id, { userId: p.userId, title: p.title, body: p.body, bookingId: p.bookingId ?? null });
      return;
    }
    if (event.event_type === 'booking.unfilled') {
      const p = event.payload as { sessionCode?: string; serviceName?: string };
      for (const ops of this.opsEmails()) await this.email.send(sessionUnfilledEmail(ops, { sessionCode: p.sessionCode ?? '', serviceName: p.serviceName ?? 'a' }, `${this.config.ADMIN_URL}/sessions?code=${encodeURIComponent(p.sessionCode ?? '')}`));
      return;
    }
    if (event.event_type === 'booking.completion_open') {
      const p = event.payload as { sessionCode?: string; serviceName?: string; when?: string; trainerName?: string };
      for (const ops of this.opsEmails()) await this.email.send(sessionNotClosedEmail(ops, { sessionCode: p.sessionCode ?? '', serviceName: p.serviceName ?? 'a', when: p.when ?? '', trainerName: p.trainerName ?? 'the trainer' }, `${this.config.ADMIN_URL}/sessions?code=${encodeURIComponent(p.sessionCode ?? '')}`));
      return;
    }
    if (event.event_type === 'package.expired') {
      const p = event.payload as { packageName?: string; unused?: number; customer?: string };
      for (const ops of this.opsEmails()) await this.email.send(packageExpiredOpsEmail(ops, { packageName: p.packageName ?? 'A', unused: p.unused ?? 0, customer: p.customer ?? 'A customer' }, `${this.config.ADMIN_URL}/packages`));
      return;
    }
    if (['trainer.job_assigned', 'trainer.job_moved', 'trainer.job_cancelled', 'trainer.job_available'].includes(event.event_type)) {
      const p = event.payload as { trainerId?: string; bookingId?: string; sessionCode?: string; serviceName?: string; when?: string; area?: string; reason?: string };
      if (!p.trainerId) return;
      // An alert about a job that has since been taken or cancelled would only confuse the trainer.
      if (event.event_type === 'trainer.job_available') {
        const open = p.bookingId ? await this.db.query(`select 1 from bookings where id = $1 and status in ('matching', 'rematching')`, [p.bookingId]) : { rows: [] };
        if (!open.rows[0]) return;
      }
      const who = await this.db.query<{ email: string | null; first_name: string | null }>(
        `select coalesce(u.verified_email, u.email, ta.email) as email, ta.first_name
           from trainers t join users u on u.id = t.user_id join trainer_applications ta on ta.id = t.application_id where t.user_id = $1 and t.status = 'active'`, [p.trainerId]);
      const trainer = who.rows[0];
      if (!trainer?.email) return; // no email on file or no longer active: nothing to send
      const ctx = { firstName: trainer.first_name ?? 'there', sessionCode: p.sessionCode ?? '', serviceName: p.serviceName ?? 'a', when: p.when ?? '', area: p.area ?? '' };
      const build = { 'trainer.job_assigned': jobAssignedEmail, 'trainer.job_moved': jobMovedEmail, 'trainer.job_available': jobAvailableEmail }[event.event_type];
      await this.email.send(build ? build(trainer.email, ctx, this.config.TRAINER_SITE_URL) : jobCancelledEmail(trainer.email, { ...ctx, ...(p.reason ? { reason: p.reason } : {}) }, this.config.TRAINER_SITE_URL));
      return;
    }
    if (event.event_type === 'referral.reward_granted') {
      const p = event.payload as { userId?: string; side?: 'referrer' | 'friend'; code?: string; worth?: string; until?: string };
      if (!p.userId || !p.code) return;
      const who = await this.db.query<{ email: string | null }>(`select coalesce(verified_email, email) as email from users where id = $1 and status = 'active'`, [p.userId]);
      const to = who.rows[0]?.email;
      if (!to) return; // phone-only customer: they still see the code in the app
      await this.email.send(referralRewardEmail(to, { side: p.side ?? 'friend', code: p.code, worth: p.worth ?? '', until: p.until ?? '' }));
      return;
    }
    if (event.event_type === 'booking.overdue') {
      const p = event.payload as { sessionCode?: string; serviceName?: string; when?: string };
      for (const ops of this.config.OPS_NOTIFY_EMAILS.split(',').map((value) => value.trim()).filter(Boolean)) {
        await this.email.send(sessionOverdueEmail(ops, { sessionCode: p.sessionCode ?? '', serviceName: p.serviceName ?? 'a', when: p.when ?? '' }, `${this.config.ADMIN_URL}/sessions?code=${encodeURIComponent(p.sessionCode ?? '')}`));
      }
      return;
    }
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
        messages.push(opsNewApplicationEmail(ops, name, app.phone_e164 ?? app.email ?? 'no contact', `${this.config.ADMIN_URL}/applications/${event.aggregate_id}`, resubmission));
      }
    } else if (app.email) {
      if (event.event_type === 'trainer.application_approved') messages.push(approvedEmail(app.email, ctx));
      if (event.event_type === 'trainer.application_rejected') messages.push(rejectedEmail(app.email, ctx));
      if (event.event_type === 'trainer.application_changes_requested') messages.push(changesEmail(app.email, ctx));
    }
    for (const message of messages) await this.email.send(message);
  }
}
