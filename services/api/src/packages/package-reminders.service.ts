import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { APP_CONFIG, type Env } from '../config/env';
import { notifyCustomer } from '../customer/notify';
import { DatabaseService } from '../database/database.service';

const DAY_MS = 86_400_000;
const BATCH = 100;
const dayOf = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const sessions = (n: number) => `${n} session${n === 1 ? '' : 's'}`;

type Due = { id: string; user_id: string; name: string; unused: number; expires_at: Date; kind: '7d' | '1d' | 'expired'; customer: string | null };

// Tells a customer before their package ends (7 days and 1 day before) and once when it has ended with sessions unused.
// Each reminder is sent once per package. Nothing is refunded automatically: ops are told when sessions expire unused and
// can extend the package or add sessions from its page (refund rules are still open, question 51).
@Injectable()
export class PackageRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PackageReminders');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly db: DatabaseService, @Inject(APP_CONFIG) private readonly config: Env) {}

  onModuleInit(): void {
    if (this.config.NODE_ENV === 'test' || !this.config.EMAIL_WORKER_ENABLED) return;
    this.timer = setInterval(() => void this.runOnce().catch((e: unknown) => this.logger.warn(`Reminders failed: ${e instanceof Error ? e.message : String(e)}`)), 60 * 60_000);
    this.timer.unref();
    setTimeout(() => void this.runOnce().catch(() => undefined), 90_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.db.tx(async (client) => {
        const due = await client.query<Due>(
          `select * from (
             select p.id, p.user_id, p.name, (p.credits_total - p.credits_used) as unused, p.expires_at,
                    case when p.expires_at <= $1 then 'expired'
                         when p.expires_at <= $1::timestamptz + interval '1 day' then '1d'
                         when p.expires_at <= $1::timestamptz + interval '7 days' then '7d' end as kind,
                    coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), 'A customer') as customer
               from package_purchases p join users u on u.id = p.user_id
              where p.status = 'paid' and p.expires_at is not null and p.credits_used < p.credits_total
                and p.expires_at > $1::timestamptz - interval '30 days' and u.status = 'active'
           ) d
           where kind is not null and not exists (select 1 from package_reminders r where r.purchase_id = d.id and r.kind = d.kind)
           order by expires_at limit ${BATCH}`,
          [now],
        );
        for (const p of due.rows) {
          await client.query(`insert into package_reminders (purchase_id, kind) values ($1, $2) on conflict do nothing`, [p.id, p.kind]);
          const unused = Number(p.unused);
          if (p.kind === 'expired') {
            await notifyCustomer(
              client, p.user_id, 'Your package has ended',
              `Your ${p.name} package ended on ${dayOf(p.expires_at)} with ${sessions(unused)} unused. If you have questions, write to admin@zoove.co and we will get back to you within 24 hours.`, null,
            );
            await client.query(`insert into outbox_events (id, aggregate_type, aggregate_id, event_type, payload) values ($1, 'package_purchase', $2, 'package.expired', $3)`, [
              uuidv7(), p.id, JSON.stringify({ packageName: p.name, unused, customer: p.customer }),
            ]);
          } else {
            const when = p.kind === '1d' ? 'tomorrow' : `on ${dayOf(p.expires_at)}`;
            await notifyCustomer(
              client, p.user_id, p.kind === '1d' ? 'Your package ends tomorrow' : 'Your package ends soon',
              `You have ${sessions(unused)} left in your ${p.name} package, and it ends ${when}. Book your remaining sessions before then so they are not lost.`, null,
            );
          }
        }
        return due.rows.length;
      });
    } finally {
      this.running = false;
    }
  }
}
