import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { sessionCodeOf } from './bookings.service';
import { formatWhen } from './rules';

export const PAYOUT_KEY = 'trainer_payout_paise';
export const MAX_PAYOUT_PAISE = 1_000_000; // Rs 10,000 a session: a typo guard, not a business rule

// The amount to save on a session as it is closed (null while no amount is set). Runs inside the completing transaction.
export async function payoutSnapshot(client: PoolClient): Promise<number | null> {
  const r = await client.query<{ v: number | null }>(`select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::int end as v from app_settings where key = $1`, [PAYOUT_KEY]);
  return r.rows[0]?.v ?? null;
}

export type Period = { sessions: number; earnedPaise: number; valuePaise?: number };
export type Slice = { name: string; sessions: number; earnedPaise: number };
export type Insights = {
  payoutPerSessionPaise: number | null;
  earningsKnown: boolean;
  periods: { today: Period; week: Period; month: Period; lifetime: Period };
  weekly: { label: string; start: string; sessions: number; earnedPaise: number }[];
  monthly: { label: string; month: string; sessions: number; earnedPaise: number }[];
  byService: Slice[];
  byParticipant: Slice[];
  byMode: Slice[];
  upcoming: number;
  rating: { average: number | null; count: number };
};
export type TrainerSessionItem = {
  id: string; sessionCode: string; serviceName: string; formatName: string; participant: string; mode: string; status: string; startsAt: string | null; whenLabel: string; area: string | null;
  customerId: string; customerName: string; live: boolean; totalPaise: number; earnedPaise: number | null; rating: number | null;
};
export type TrainerPerformance = { insights: Insights; live: TrainerSessionItem[]; upcoming: TrainerSessionItem[]; past: TrainerSessionItem[] };

const PARTICIPANT_LABEL: Record<string, string> = { personal: 'Personal', duo: 'Duo', loved_one: 'Loved one', group: 'Group' };
const MODE_LABEL: Record<string, string> = { instant: 'Instant', scheduled: 'Scheduled', demo: 'Demo' };

// The CTE every figure comes from: this trainer's completed sessions, with the time in India (week = Monday to Sunday).
const DONE = `with done as (
  select b.id, b.total_paise, coalesce(b.trainer_payout_paise, 0) as earned, b.participant, b.mode, s.name as service_name,
         (coalesce(b.completed_at, b.starts_at, b.created_at) at time zone 'Asia/Kolkata') as at_ist
    from bookings b join services s on s.id = b.service_id where b.coach_id = $1::uuid and b.status = 'completed')`;
const NOW_IST = `(now() at time zone 'Asia/Kolkata')`;

@Injectable()
export class TrainerEarningsService {
  constructor(private readonly db: DatabaseService) {}

  async getPayout(): Promise<{ payoutPerSessionPaise: number | null }> {
    const r = await this.db.query<{ v: number | null }>(`select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::int end as v from app_settings where key = $1`, [PAYOUT_KEY]);
    return { payoutPerSessionPaise: r.rows[0]?.v ?? null };
  }

  // An owner sets the flat amount. Sessions already completed with no amount saved get this one (once); sessions that already
  // have an amount keep theirs. Passing null clears the setting for future sessions only.
  async setPayout(adminId: string, paise: number | null): Promise<{ payoutPerSessionPaise: number | null; filledIn: number }> {
    if (paise !== null && (!Number.isInteger(paise) || paise < 0 || paise > MAX_PAYOUT_PAISE)) throw new DomainError('INVALID_REQUEST', 'Enter an amount between Rs 0 and Rs 10,000.');
    let filledIn = 0;
    await this.db.tx(async (client) => {
      await client.query(
        `insert into app_settings (key, value, updated_by, updated_at) values ($1, $2::jsonb, $3, now())
         on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
        [PAYOUT_KEY, JSON.stringify(paise), adminId],
      );
      if (paise !== null) {
        const r = await client.query(`update bookings set trainer_payout_paise = $1 where status = 'completed' and coach_id is not null and trainer_payout_paise is null`, [paise]);
        filledIn = r.rowCount ?? 0;
      }
      await client.query(`insert into audit_log (actor_user_id, action, entity_type, entity_id, after) values ($1, 'settings.trainer_payout', 'app_settings', null, $2)`, [adminId, JSON.stringify({ paise, filledIn })]);
    });
    return { payoutPerSessionPaise: paise, filledIn };
  }

  // Earnings and breakdowns for one trainer. `withValue` adds what the customers paid, for ops only (the trainer never sees it).
  async insights(trainerUserId: string, withValue: boolean): Promise<Insights> {
    const id = [trainerUserId];
    const [setting, periods, weekly, monthly, service, participant, mode, upcoming, rating, known] = await Promise.all([
      this.getPayout(),
      this.db.query<Record<string, string>>(
        `${DONE}
         select count(*) filter (where at_ist >= date_trunc('day', ${NOW_IST})) as t_n, coalesce(sum(earned) filter (where at_ist >= date_trunc('day', ${NOW_IST})), 0) as t_e, coalesce(sum(total_paise) filter (where at_ist >= date_trunc('day', ${NOW_IST})), 0) as t_v,
                count(*) filter (where at_ist >= date_trunc('week', ${NOW_IST})) as w_n, coalesce(sum(earned) filter (where at_ist >= date_trunc('week', ${NOW_IST})), 0) as w_e, coalesce(sum(total_paise) filter (where at_ist >= date_trunc('week', ${NOW_IST})), 0) as w_v,
                count(*) filter (where at_ist >= date_trunc('month', ${NOW_IST})) as m_n, coalesce(sum(earned) filter (where at_ist >= date_trunc('month', ${NOW_IST})), 0) as m_e, coalesce(sum(total_paise) filter (where at_ist >= date_trunc('month', ${NOW_IST})), 0) as m_v,
                count(*) as l_n, coalesce(sum(earned), 0) as l_e, coalesce(sum(total_paise), 0) as l_v
           from done`, id),
      this.db.query<{ start: string; n: string; e: string }>(
        `${DONE}
         select to_char(w.start, 'YYYY-MM-DD') as start, count(d.id) as n, coalesce(sum(d.earned), 0) as e
           from generate_series(date_trunc('week', ${NOW_IST}) - interval '7 weeks', date_trunc('week', ${NOW_IST}), interval '1 week') as w(start)
           left join done d on date_trunc('week', d.at_ist) = w.start group by w.start order by w.start`, id),
      this.db.query<{ month: string; n: string; e: string }>(
        `${DONE}
         select to_char(m.start, 'YYYY-MM') as month, count(d.id) as n, coalesce(sum(d.earned), 0) as e
           from generate_series(date_trunc('month', ${NOW_IST}) - interval '5 months', date_trunc('month', ${NOW_IST}), interval '1 month') as m(start)
           left join done d on date_trunc('month', d.at_ist) = m.start group by m.start order by m.start`, id),
      this.db.query<{ k: string; n: string; e: string }>(`${DONE} select service_name as k, count(*) as n, coalesce(sum(earned), 0) as e from done group by service_name order by sum(earned) desc, count(*) desc, service_name`, id),
      this.db.query<{ k: string; n: string; e: string }>(`${DONE} select participant as k, count(*) as n, coalesce(sum(earned), 0) as e from done group by participant order by sum(earned) desc, count(*) desc`, id),
      this.db.query<{ k: string; n: string; e: string }>(`${DONE} select mode::text as k, count(*) as n, coalesce(sum(earned), 0) as e from done group by mode order by sum(earned) desc, count(*) desc`, id),
      this.db.query<{ n: string }>(`select count(*) as n from bookings where coach_id = $1::uuid and status = 'confirmed'`, id),
      this.db.query<{ avg: string | null; n: string }>(`select round(avg(r.stars)::numeric, 2)::text as avg, count(*) as n from session_ratings r join bookings b on b.id = r.booking_id where b.coach_id = $1::uuid`, id),
      this.db.query<{ any: boolean }>(`select exists (select 1 from bookings where coach_id = $1::uuid and status = 'completed' and trainer_payout_paise is not null) as any`, id),
    ]);
    const p = periods.rows[0]!;
    const period = (prefix: string): Period => ({ sessions: Number(p[`${prefix}_n`]), earnedPaise: Number(p[`${prefix}_e`]), ...(withValue ? { valuePaise: Number(p[`${prefix}_v`]) } : {}) });
    const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
    const dayName = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const slices = (rows: { k: string; n: string; e: string }[], labels?: Record<string, string>): Slice[] => rows.map((r) => ({ name: labels?.[r.k] ?? r.k, sessions: Number(r.n), earnedPaise: Number(r.e) }));
    return {
      payoutPerSessionPaise: setting.payoutPerSessionPaise,
      earningsKnown: setting.payoutPerSessionPaise !== null || known.rows[0]!.any,
      periods: { today: period('t'), week: period('w'), month: period('m'), lifetime: period('l') },
      weekly: weekly.rows.map((r) => ({ label: dayName(r.start), start: r.start, sessions: Number(r.n), earnedPaise: Number(r.e) })),
      monthly: monthly.rows.map((r) => ({ label: monthName(r.month), month: r.month, sessions: Number(r.n), earnedPaise: Number(r.e) })),
      byService: slices(service.rows),
      byParticipant: slices(participant.rows, PARTICIPANT_LABEL),
      byMode: slices(mode.rows, MODE_LABEL),
      upcoming: Number(upcoming.rows[0]?.n ?? 0),
      rating: { average: rating.rows[0]?.avg != null ? Number(rating.rows[0].avg) : null, count: Number(rating.rows[0]?.n ?? 0) },
    };
  }

  // The trainer's sessions for ops: on now, coming up, and finished (newest first, up to 100).
  async sessions(trainerUserId: string): Promise<Pick<TrainerPerformance, 'live' | 'upcoming' | 'past'>> {
    const r = await this.db.query<{
      id: string; service_name: string; format_name: string; participant: string; mode: string; status: string; starts_at: Date | null; address_area: string | null; user_id: string; customer_name: string | null;
      started_at: Date | null; total_paise: number; trainer_payout_paise: number | null; stars: number | null;
    }>(
      `select b.id, s.name as service_name, f.name as format_name, b.participant, b.mode, b.status, b.starts_at, b.address_area, b.user_id, u.full_name as customer_name, b.started_at, b.total_paise, b.trainer_payout_paise,
              (select r.stars from session_ratings r where r.booking_id = b.id) as stars
         from bookings b join services s on s.id = b.service_id join service_formats f on f.id = b.format_id join users u on u.id = b.user_id
        where b.coach_id = $1::uuid and b.status in ('confirmed', 'completed')
        order by case when b.status = 'confirmed' then 0 else 1 end, case when b.status = 'confirmed' then b.starts_at end asc nulls first, b.completed_at desc nulls last, b.starts_at desc nulls last limit 150`, [trainerUserId]);
    const item = (x: (typeof r.rows)[number]): TrainerSessionItem => ({
      id: x.id, sessionCode: sessionCodeOf(x.id), serviceName: x.service_name, formatName: x.format_name, participant: x.participant, mode: x.mode, status: x.status,
      startsAt: x.starts_at ? x.starts_at.toISOString() : null, whenLabel: x.starts_at ? formatWhen(x.starts_at) : x.mode === 'instant' ? 'Instant' : 'To be scheduled', area: x.address_area,
      customerId: x.user_id, customerName: x.customer_name ?? 'Customer', live: x.status === 'confirmed' && x.started_at !== null, totalPaise: x.total_paise, earnedPaise: x.status === 'completed' ? x.trainer_payout_paise : null, rating: x.stars,
    });
    const all = r.rows.map(item);
    return { live: all.filter((x) => x.live), upcoming: all.filter((x) => x.status === 'confirmed' && !x.live), past: all.filter((x) => x.status === 'completed').slice(0, 100) };
  }

  async performance(applicationId: string): Promise<TrainerPerformance> {
    const t = await this.db.query<{ user_id: string }>(`select t.user_id from trainers t where t.application_id = $1`, [applicationId]);
    const userId = t.rows[0]?.user_id;
    if (!userId) throw new DomainError('NOT_FOUND', 'This person is not a trainer yet, so there are no sessions to show.');
    const [insights, sessions] = await Promise.all([this.insights(userId, true), this.sessions(userId)]);
    return { insights, ...sessions };
  }
}
