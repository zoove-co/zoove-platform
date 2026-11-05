import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { CUSTOMER_CHANNELS, type CustomerMessage, type MessageChannel } from './message-channel';

// Sends one customer message on every channel. Each channel's result is recorded per event, so when one channel fails and
// the event is retried, the channels that already worked are not repeated (no double emails).
@Injectable()
export class CustomerMessageService {
  private readonly logger = new Logger('CustomerMessages');

  constructor(@Inject(CUSTOMER_CHANNELS) private readonly channels: MessageChannel[]) {}

  // `client` is the outbox worker's open transaction: the event row is locked by it, so the records must be written on the same connection.
  async deliver(client: PoolClient, eventId: string, message: CustomerMessage): Promise<void> {
    const failures: string[] = [];
    for (const channel of this.channels) {
      const destination = `notify:${channel.name}`;
      const done = await client.query(`select 1 from event_deliveries where event_id = $1 and destination = $2 and status in ('delivered', 'skipped')`, [eventId, destination]);
      if (done.rows[0]) continue;
      try {
        const result = await channel.deliver(message);
        await this.record(client, eventId, destination, result === 'sent' ? 'delivered' : 'skipped', null);
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        this.logger.warn(`${channel.name} failed for event ${eventId}: ${text}`);
        await this.record(client, eventId, destination, 'failed', text);
        failures.push(`${channel.name}: ${text}`);
      }
    }
    if (failures.length > 0) throw new Error(failures.join('; ').slice(0, 400));
  }

  private async record(client: PoolClient, eventId: string, destination: string, status: 'delivered' | 'skipped' | 'failed', error: string | null): Promise<void> {
    await client.query(
      `insert into event_deliveries (event_id, destination, status, attempts, last_error) values ($1, $2, $3, 1, $4)
       on conflict (event_id, destination) do update set status = excluded.status, attempts = event_deliveries.attempts + 1, last_error = excluded.last_error, updated_at = now()`,
      [eventId, destination, status, error],
    );
  }
}
