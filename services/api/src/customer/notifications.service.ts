import { Injectable } from '@nestjs/common';

import { v7 as uuidv7 } from 'uuid';

import { DatabaseService } from '../database/database.service';

export type AppNotification = { id: string; title: string; body: string; createdAt: string; read: boolean; bookingId: string | null };

@Injectable()
export class CustomerNotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: string): Promise<AppNotification[]> {
    const result = await this.db.query<{ id: string; title: string; body: string; created_at: Date; read_at: Date | null; booking_id: string | null }>(
      `select id, title, body, created_at, read_at, booking_id from customer_notifications where user_id = $1 order by created_at desc, id desc limit 100`,
      [userId],
    );
    return result.rows.map((row) => ({ id: row.id, title: row.title, body: row.body, createdAt: row.created_at.toISOString(), read: row.read_at !== null, bookingId: row.booking_id }));
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db.query(`update customer_notifications set read_at = now() where user_id = $1 and read_at is null`, [userId]);
  }

  // The phone's push token. One token belongs to one customer: signing in as someone else on the same phone moves it.
  async registerDevice(userId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
    await this.db.query(
      `insert into notification_devices (id, user_id, token, platform) values ($1, $2, $3, $4)
       on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now()`,
      [uuidv7(), userId, token, platform],
    );
  }

  async removeDevice(userId: string, token: string): Promise<void> {
    await this.db.query(`delete from notification_devices where user_id = $1 and token = $2`, [userId, token]);
  }
}
