import { Injectable } from '@nestjs/common';

import { AddressesService } from '../addresses/addresses.service';
import { BOOKING_SELECT, bookingFromRow, isInProgress, type Booking, type Row } from '../bookings/bookings.service';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseService } from '../database/database.service';
import { DAY_MS, INSTANT_ETA_HOURS, WEEKLY_GOAL, WEEK_MS, istIsoDate, istWeekStart } from './customer.rules';

type Mode = 'instant' | 'scheduled' | 'demo';
export type HomeData = {
  customerFirstName: string | null;
  locationLabel: string | null;
  locationServiceable: boolean;
  locationArea: string | null;
  hasUnreadNotifications: boolean;
  instant: { etaHours: number; pricePaise: number };
  scheduled: { pricePaise: number };
  demo: { pricePaise: number; originalPricePaise: number };
  services: { slug: string; name: string }[];
  upcomingSession: { id: string; serviceName: string; whenLabel: string; status: Booking['status']; sessionsDoneThisWeek: number; weeklyGoal: number; upcomingCount: number; inProgress: boolean } | null;
  weekly: { done: number; goal: number };
};
export type StreakData = {
  weekDays: { iso: string; weekday: string; dayOfMonth: number; state: 'completed' | 'booked' | 'none'; isToday: boolean }[];
  sessionsThisWeek: number;
  weeklyGoal: number;
  totalSessions: number;
  weekStreak: number;
  focusAreas: { serviceSlug: string; serviceName: string; sessions: number }[];
  recentSessions: Booking[];
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ACTIVE = new Set(['matching', 'confirmed', 'rematching']);

@Injectable()
export class CustomerService {
  constructor(
    private readonly db: DatabaseService,
    private readonly addresses: AddressesService,
    private readonly catalog: CatalogService,
  ) {}

  async home(userId: string): Promise<HomeData> {
    const now = new Date();
    const [user, addressList, unread, prices, services, bookings] = await Promise.all([
      this.db.query<{ first_name: string | null }>(`select first_name from users where id = $1`, [userId]),
      this.addresses.list(userId),
      this.db.query(`select 1 from customer_notifications where user_id = $1 and read_at is null limit 1`, [userId]),
      this.db.query<{ mode: Mode; price: string; original: string | null }>(
        // Default prices (for all services) win; if only per-service prices exist, show the lowest.
        `select mode, (array_agg(price_paise order by (service_id is null) desc, price_paise))[1] as price,
                (array_agg(original_price_paise order by (service_id is null) desc, price_paise))[1] as original
           from service_prices where is_active group by mode`,
      ),
      this.catalog.listServices(),
      this.db.query<Row>(`${BOOKING_SELECT} where b.user_id = $1 and b.status in ('matching','confirmed','rematching','completed') order by b.starts_at nulls first limit 300`, [userId]),
    ]);

    const current = addressList.find((item) => item.isDefault) ?? addressList[0];
    const price = (mode: Mode) => prices.rows.find((row) => row.mode === mode);
    const weekStart = istWeekStart(now).getTime();
    const done = bookings.rows.filter((row) => row.status === 'completed' && row.starts_at && row.starts_at.getTime() >= weekStart && row.starts_at.getTime() < weekStart + WEEK_MS).length;
    const activeRows = bookings.rows.filter((row) => ACTIVE.has(row.status));
    // A session that is on right now comes first, then the soonest.
    const next = activeRows.find((row) => isInProgress(row.status, row.starts_at, row.duration_max_minutes, now)) ?? activeRows[0];
    const upcoming = next ? bookingFromRow(next, now) : null;

    return {
      customerFirstName: user.rows[0]?.first_name ?? null,
      locationLabel: current ? `${current.label} · ${current.area}` : null,
      locationServiceable: current?.serviceable ?? true,
      locationArea: current?.area ?? null,
      hasUnreadNotifications: unread.rows.length > 0,
      instant: { etaHours: INSTANT_ETA_HOURS, pricePaise: Number(price('instant')?.price ?? 0) },
      scheduled: { pricePaise: Number(price('scheduled')?.price ?? 0) },
      demo: {
        pricePaise: Number(price('demo')?.price ?? 0),
        originalPricePaise: Number(price('demo')?.original ?? price('demo')?.price ?? 0),
      },
      services: services.map((item) => ({ slug: item.slug, name: item.name })),
      upcomingSession: upcoming
        ? { id: upcoming.id, serviceName: upcoming.serviceName, whenLabel: upcoming.whenLabel, status: upcoming.status, sessionsDoneThisWeek: done, weeklyGoal: WEEKLY_GOAL, upcomingCount: activeRows.length, inProgress: upcoming.inProgress }
        : null,
      weekly: { done, goal: WEEKLY_GOAL },
    };
  }

  // Always derived from bookings. A "week streak" counts consecutive weeks with at least one completed session;
  // an empty current week does not break a running streak (assumption, question 46).
  async streak(userId: string): Promise<StreakData> {
    const now = new Date();
    const result = await this.db.query<Row>(
      `${BOOKING_SELECT} where b.user_id = $1 and b.starts_at is not null and b.status in ('matching','confirmed','rematching','completed') order by b.starts_at desc limit 500`,
      [userId],
    );
    const completed = result.rows.filter((row) => row.status === 'completed');
    const active = result.rows.filter((row) => ACTIVE.has(row.status));
    const weekStart = istWeekStart(now);
    const today = istIsoDate(now);
    const onDay = (list: Row[], iso: string) => list.some((row) => row.starts_at && istIsoDate(row.starts_at) === iso);

    const weekDays = WEEKDAYS.map((weekday, index) => {
      const day = new Date(weekStart.getTime() + index * DAY_MS);
      const iso = istIsoDate(day);
      const state = onDay(completed, iso) ? 'completed' : onDay(active, iso) ? 'booked' : 'none';
      return { iso, weekday, dayOfMonth: Number(iso.slice(8, 10)), state: state as 'completed' | 'booked' | 'none', isToday: iso === today };
    });

    const weekHas = (offset: number) => {
      const start = weekStart.getTime() - offset * WEEK_MS;
      return completed.some((row) => row.starts_at && row.starts_at.getTime() >= start && row.starts_at.getTime() < start + WEEK_MS);
    };
    let weekStreak = 0;
    for (let offset = weekHas(0) ? 0 : 1; weekHas(offset); offset += 1) weekStreak += 1;

    const bySlug = new Map<string, { serviceName: string; sessions: number }>();
    for (const row of completed) {
      const entry = bySlug.get(row.service_slug) ?? { serviceName: row.service_name, sessions: 0 };
      entry.sessions += 1;
      bySlug.set(row.service_slug, entry);
    }

    return {
      weekDays,
      sessionsThisWeek: completed.filter((row) => row.starts_at && row.starts_at.getTime() >= weekStart.getTime() && row.starts_at.getTime() < weekStart.getTime() + WEEK_MS).length,
      weeklyGoal: WEEKLY_GOAL,
      totalSessions: completed.length,
      weekStreak,
      focusAreas: [...bySlug.entries()].map(([serviceSlug, value]) => ({ serviceSlug, ...value })).sort((a, b) => b.sessions - a.sessions),
      recentSessions: completed.slice(0, 3).map((row) => bookingFromRow(row, now)),
    };
  }

  // Coaches are not assigned to sessions yet (trainer matching is not built), so nobody can be "past".
  pastCoaches(): { id: string; name: string; sessionsTogether: number; lastSessionLabel: string }[] {
    return [];
  }

  // Package definitions are set in the admin panel (decision D13) and that screen does not exist yet. Nothing is invented here.
  packages(): unknown[] {
    return [];
  }
}
