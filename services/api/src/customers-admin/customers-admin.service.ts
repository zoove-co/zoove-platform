import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { DomainError } from '../common/domain-error';
import { sessionCodeOf } from '../bookings/bookings.service';
import { DatabaseService } from '../database/database.service';

export type CustomerRow = {
  id: string; name: string | null; email: string | null; phone: string; status: string; joinedAt: string; lastLoginAt: string | null;
  sessionsDone: number; sessionsUpcoming: number; spentPaise: number;
};

export type CustomerDetail = CustomerRow & {
  addresses: { id: string; label: string; line1: string; line2: string | null; locality: string | null; city: string; pincode: string | null; isDefault: boolean }[];
  bookings: { id: string; sessionCode: string; serviceName: string; formatName: string; mode: string; status: string; startsAt: string | null; trainerName: string | null; totalPaise: number; rating: number | null; createdAt: string }[];
  packages: { id: string; name: string; status: string; creditsTotal: number; creditsUsed: number; expiresAt: string | null; totalPaise: number }[];
  referralCode: string | null;
  referredBy: string | null;
  ratingsGiven: number;
};

type ListDbRow = { id: string; full_name: string | null; email: string | null; phone_e164: string; status: string; created_at: Date; last_login_at: Date | null; done: string; upcoming: string; spent: string | null };

const LIST_LIMIT = 100;

@Injectable()
export class CustomersAdminService {
  constructor(private readonly db: DatabaseService) {}

  async list(q: string | undefined): Promise<{ customers: CustomerRow[]; total: number }> {
    const term = q?.trim() ?? '';
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const where = `exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'customer')
                   and ($1 = '' or u.full_name ilike $2 or u.email ilike $2 or u.phone_e164 like $2)`;
    const rows = await this.db.query<ListDbRow>(
      `select u.id, u.full_name, u.email, u.phone_e164, u.status, u.created_at, u.last_login_at,
              (select count(*) from bookings b where b.user_id = u.id and b.status = 'completed') as done,
              (select count(*) from bookings b where b.user_id = u.id and b.status in ('matching', 'confirmed', 'rematching')) as upcoming,
              (select coalesce(sum(b.total_paise), 0) from bookings b where b.user_id = u.id and b.status = 'completed') as spent
         from users u where ${where} order by u.created_at desc limit ${LIST_LIMIT}`,
      [term, like],
    );
    const total = await this.db.query<{ n: string }>(`select count(*) as n from users u where ${where}`, [term, like]);
    return { customers: rows.rows.map(toRow), total: Number(total.rows[0]?.n ?? 0) };
  }

  async detail(adminId: string, id: string): Promise<CustomerDetail> {
    const found = await this.db.query<ListDbRow>(
      `select u.id, u.full_name, u.email, u.phone_e164, u.status, u.created_at, u.last_login_at,
              (select count(*) from bookings b where b.user_id = u.id and b.status = 'completed') as done,
              (select count(*) from bookings b where b.user_id = u.id and b.status in ('matching', 'confirmed', 'rematching')) as upcoming,
              (select coalesce(sum(b.total_paise), 0) from bookings b where b.user_id = u.id and b.status = 'completed') as spent
         from users u where u.id = $1 and exists (select 1 from user_roles r where r.user_id = u.id and r.role = 'customer')`,
      [id],
    );
    const row = found.rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'No such customer.');

    const [addresses, bookings, packages, code, referred, rated] = await Promise.all([
      this.db.query<{ id: string; label: string; line1: string; line2: string | null; locality: string | null; city: string; pincode: string | null; is_default: boolean }>(
        `select id, label, line1, line2, locality, city, pincode, is_default from addresses where user_id = $1 and deleted_at is null order by is_default desc, created_at`, [id]),
      this.db.query<{ id: string; mode: string; status: string; starts_at: Date | null; total_paise: number; created_at: Date; service_name: string; format_name: string; trainer_name: string | null; stars: number | null }>(
        `select b.id, b.mode, b.status, b.starts_at, b.total_paise, b.created_at, s.name as service_name, f.name as format_name,
                (select trim(concat_ws(' ', ta.first_name, ta.last_name)) from trainers t join trainer_applications ta on ta.id = t.application_id where t.user_id = b.coach_id) as trainer_name,
                (select r.stars from session_ratings r where r.booking_id = b.id) as stars
           from bookings b join services s on s.id = b.service_id join service_formats f on f.id = b.format_id
          where b.user_id = $1 order by coalesce(b.starts_at, b.created_at) desc limit 50`, [id]),
      this.db.query<{ id: string; name: string; status: string; credits_total: number; credits_used: number; expires_at: Date | null; total_paise: number }>(
        `select id, name, status, credits_total, credits_used, expires_at, total_paise from package_purchases where user_id = $1 order by created_at desc limit 20`, [id]),
      this.db.query<{ code: string }>(`select code from referral_codes where user_id = $1`, [id]),
      this.db.query<{ name: string | null }>(`select u.full_name as name from referrals r join users u on u.id = r.referrer_id where r.referred_id = $1`, [id]),
      this.db.query<{ n: string }>(`select count(*) as n from session_ratings where user_id = $1`, [id]),
    ]);

    // Customer details are personal data: every time one is opened it is recorded, like the KYC documents.
    await this.db.query(`insert into audit_log (id, actor_user_id, action, entity_type, entity_id, after) values ($1, $2, 'customer.view', 'user', $3, '{}')`, [uuidv7(), adminId, id]);

    return {
      ...toRow(row),
      addresses: addresses.rows.map((a) => ({ id: a.id, label: a.label, line1: a.line1, line2: a.line2, locality: a.locality, city: a.city, pincode: a.pincode, isDefault: a.is_default })),
      bookings: bookings.rows.map((b) => ({
        id: b.id, sessionCode: sessionCodeOf(b.id), serviceName: b.service_name, formatName: b.format_name, mode: b.mode, status: b.status,
        startsAt: b.starts_at ? b.starts_at.toISOString() : null, trainerName: b.trainer_name, totalPaise: b.total_paise, rating: b.stars, createdAt: b.created_at.toISOString(),
      })),
      packages: packages.rows.map((p) => ({ id: p.id, name: p.name, status: p.status, creditsTotal: p.credits_total, creditsUsed: p.credits_used, expiresAt: p.expires_at ? p.expires_at.toISOString() : null, totalPaise: p.total_paise })),
      referralCode: code.rows[0]?.code ?? null,
      referredBy: referred.rows[0] ? (referred.rows[0].name ?? 'A customer') : null,
      ratingsGiven: Number(rated.rows[0]?.n ?? 0),
    };
  }
}

function toRow(r: ListDbRow): CustomerRow {
  return {
    id: r.id, name: r.full_name, email: r.email, phone: r.phone_e164, status: r.status, joinedAt: r.created_at.toISOString(), lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
    sessionsDone: Number(r.done), sessionsUpcoming: Number(r.upcoming), spentPaise: Number(r.spent ?? 0),
  };
}
