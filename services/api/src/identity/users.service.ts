import { Injectable } from '@nestjs/common';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';

// Same shape as Profile in the customer app, so the app can swap its mock for this API unchanged.
export type Profile = { phone: string | null; firstName: string | null; lastName: string | null; email: string | null };

type UserRow = { phone_e164: string | null; first_name: string | null; last_name: string | null; email: string | null };

const toProfile = (row: UserRow): Profile => ({
  phone: row.phone_e164,
  firstName: row.first_name,
  lastName: row.last_name,
  email: row.email,
});

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(userId: string): Promise<Profile> {
    const result = await this.db.query<UserRow>(
      `select phone_e164, first_name, last_name, email from users where id = $1 and status = 'active'`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'Profile not found.');
    return toProfile(row);
  }

  // Delete my account. The row stays (orders, payments) but every personal detail is removed, the sign-in is
  // ended on all devices, and the same email can start a fresh account later.
  async deleteAccount(userId: string): Promise<void> {
    await this.db.tx(async (client) => {
      const found = await client.query<{ status: string }>(`select status from users where id = $1 for update`, [userId]);
      if (found.rows[0]?.status !== 'active') throw new DomainError('NOT_FOUND', 'Profile not found.');

      // Staff and trainers have their own accounts and are removed by an admin, never from the customer app.
      const roles = await client.query(`select 1 from user_roles where user_id = $1 and role in ('admin', 'trainer')`, [userId]);
      if (roles.rows.length > 0) throw new DomainError('FORBIDDEN', 'This account cannot be deleted here. Please contact support.');

      // Never leave a coach on the way to a customer who no longer exists.
      const live = await client.query<{ count: string }>(
        `select count(*) from bookings where user_id = $1 and status in ('matching', 'confirmed', 'rematching')`,
        [userId],
      );
      const liveCount = Number(live.rows[0]?.count ?? 0);
      if (liveCount > 0) {
        throw new DomainError('HAS_ACTIVE_BOOKINGS', 'Cancel your upcoming sessions before deleting your account.', { count: liveCount });
      }

      await client.query(
        `update users set status = 'deleted', phone_e164 = null, email = null, verified_email = null,
                first_name = null, last_name = null, full_name = null
          where id = $1`,
        [userId],
      );
      await client.query(`delete from refresh_tokens where user_id = $1`, [userId]);
      // The consent record stays as proof; the network address recorded with it goes.
      await client.query(`update consents set ip = null where user_id = $1`, [userId]);
      await client.query(`delete from customer_notifications where user_id = $1`, [userId]);
      await client.query(`delete from customer_profiles where user_id = $1`, [userId]);
      await client.query(`delete from referral_codes where user_id = $1`, [userId]);
      await client.query(
        `update party_requests set address_label = 'Deleted', address_line = 'Deleted', address_area = null, address_pincode = null, contact_name = null, contact_phone = null, note = null where user_id = $1`,
        [userId],
      );
      // Unpaid package orders are dropped; paid credits that are left are forfeited with the account.
      await client.query(`update package_purchases set status = 'cancelled' where user_id = $1 and status = 'awaiting_payment'`, [userId]);
      // Addresses stay only because past bookings point at them: the details and the pin are wiped.
      await client.query(
        `update addresses set label = 'Deleted', line1 = 'Deleted', line2 = null, locality = null, pincode = null,
                latitude = null, longitude = null, location = null, is_default = false, deleted_at = coalesce(deleted_at, now())
          where user_id = $1`,
        [userId],
      );
      // The same on every booking snapshot, including the other person's name and number on Loved-one bookings.
      await client.query(
        `update bookings set address_label = 'Deleted', address_line = 'Deleted', address_area = null, address_pincode = null,
                recipient_name = null, recipient_phone = null
          where user_id = $1`,
        [userId],
      );
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id) values ($1, 'customer.account_deleted', 'user', $1)`, [userId]);
    });
  }

  async updateProfile(
    userId: string,
    input: { firstName?: string | undefined; lastName?: string | undefined; email?: string | undefined },
  ): Promise<Profile> {
    // Only the fields that were sent are changed; an empty string clears lastName or email.
    const sets: string[] = [];
    const params: unknown[] = [userId];
    const add = (column: string, value: string | null) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (input.firstName !== undefined) add('first_name', input.firstName);
    if (input.lastName !== undefined) add('last_name', input.lastName || null);
    if (input.email !== undefined) add('email', input.email || null);
    if (sets.length === 0) return this.getProfile(userId);

    try {
      const result = await this.db.query<UserRow>(
        `update users set ${sets.join(', ')}
          where id = $1 and status = 'active'
          returning phone_e164, first_name, last_name, email`,
        params,
      );
      const row = result.rows[0];
      if (!row) throw new DomainError('NOT_FOUND', 'Profile not found.');
      return toProfile(row);
    } catch (error) {
      // 23505 = unique violation: another customer already uses this email.
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
        throw new DomainError('EMAIL_TAKEN', 'This email is already in use.');
      }
      throw error;
    }
  }
}
