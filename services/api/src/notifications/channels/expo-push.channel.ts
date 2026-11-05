import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../../config/env';
import { DatabaseService } from '../../database/database.service';
import type { ChannelResult, CustomerMessage, MessageChannel } from '../message-channel';

export const PUSH_HTTP = Symbol('PUSH_HTTP');
const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

// Push messages through Expo's push service (works for iOS and Android once the app is built with push credentials).
// A phone that reports "DeviceNotRegistered" (app removed) has its token deleted.
@Injectable()
export class ExpoPushChannel implements MessageChannel {
  readonly name = 'push';
  private readonly logger = new Logger('Push');

  constructor(
    private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: Env,
    @Optional() @Inject(PUSH_HTTP) private readonly http: typeof fetch = fetch,
  ) {}

  async deliver(message: CustomerMessage): Promise<ChannelResult> {
    const devices = await this.db.query<{ token: string }>(`select token from notification_devices where user_id = $1`, [message.userId]);
    if (devices.rows.length === 0) return 'skipped';
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.config.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${this.config.EXPO_ACCESS_TOKEN}`;
    const response = await this.http(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(devices.rows.map((d) => ({ to: d.token, title: message.title, body: message.body, sound: 'default', data: { bookingId: message.bookingId } }))),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`push service answered ${response.status}`);
    const json = (await response.json()) as { data?: Ticket[] };
    const tickets = json.data ?? [];
    const dead: string[] = [];
    tickets.forEach((ticket, index) => {
      const device = devices.rows[index];
      if (device && ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') dead.push(device.token);
    });
    if (dead.length > 0) await this.db.query(`delete from notification_devices where token = any($1)`, [dead]);
    if (tickets.length > 0 && tickets.every((t) => t.status === 'error') && dead.length < tickets.length) this.logger.warn('Push service rejected every message');
    return tickets.some((t) => t.status === 'ok') ? 'sent' : 'skipped';
  }
}
