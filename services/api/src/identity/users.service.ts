import { Injectable } from '@nestjs/common';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';

// Same shape as Profile in the customer app, so the app can swap its mock for this API unchanged.
export type Profile = { phone: string; firstName: string | null; lastName: string | null; email: string | null };

type UserRow = { phone_e164: string; first_name: string | null; last_name: string | null; email: string | null };

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
