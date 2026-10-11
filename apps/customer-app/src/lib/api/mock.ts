import { rupeesToPaise } from '@zoove/shared';

import { formatClock, formatWhen } from '@/lib/dates';

import {
  ApiError,
  type Address,
  type Api,
  type Booking,
  type BookingMode,
  type BookingResult,
  type HomeData,
  type ServiceDetail,
  type TimeSlot,
} from './types';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Placeholder data mirroring Pratik's prototype v1. Prices and rules are NOT final:
// see docs/open-questions.md.
const prices: Record<BookingMode, number> = {
  instant: rupeesToPaise(1500),
  scheduled: rupeesToPaise(1500),
  demo: rupeesToPaise(500),
};

const home: HomeData = {
  customerFirstName: 'Pratik',
  locationLabel: 'Bandra West, Mumbai',
  hasUnreadNotifications: true,
  instant: { etaHours: 4, pricePaise: prices.instant },
  scheduled: { pricePaise: prices.scheduled },
  demo: { pricePaise: prices.demo, originalPricePaise: rupeesToPaise(1500) },
  services: [
    { slug: 'yoga', name: 'Yoga' },
    { slug: 'strength', name: 'Strength' },
    { slug: 'pilates', name: 'Pilates' },
    { slug: 'zumba', name: 'Zumba' },
  ],
  upcomingSession: null,
};

const serviceDetails: Record<string, ServiceDetail | undefined> = {
  yoga: {
    slug: 'yoga',
    name: 'Yoga',
    tagline: 'Move. Breathe. Feel good.',
    durationLabel: '45–60 mins',
    intensityLabel: 'Low–Moderate',
    pricePaise: prices,
    formats: [
      {
        slug: 'power-yoga',
        name: 'Power Yoga',
        description:
          'Build strength, balance and flexibility through flowing poses at a pace that works for you.',
      },
      {
        slug: 'vinyasa-yoga',
        name: 'Vinyasa Yoga',
        description:
          'Link breath with movement in an energizing sequence that supports flexibility and focus.',
      },
      {
        slug: 'hatha-yoga',
        name: 'Hatha Yoga',
        description: 'Steady poses and mindful breathing help you release tension and improve posture.',
      },
    ],
  },
  strength: {
    slug: 'strength',
    name: 'Strength',
    tagline: 'Build strength that fits your life.',
    durationLabel: '45–60 mins',
    intensityLabel: 'Moderate–High',
    pricePaise: prices,
    formats: [
      {
        slug: 'strength-training',
        name: 'Strength Training',
        description: 'Progressive resistance work tailored to your goals, experience and available equipment.',
      },
      {
        slug: 'functional-strength',
        name: 'Functional Strength',
        description: 'Train everyday movement patterns with guided resistance, control and confidence.',
      },
      {
        slug: 'mobility-strength',
        name: 'Mobility + Strength',
        description: 'Combine joint mobility with controlled strength work for a balanced routine.',
      },
    ],
  },
  pilates: {
    slug: 'pilates',
    name: 'Pilates',
    tagline: 'Move with control. Find your center.',
    durationLabel: '45–60 mins',
    intensityLabel: 'Low–Moderate',
    pricePaise: prices,
    formats: [
      {
        slug: 'mat-pilates',
        name: 'Mat Pilates',
        description: 'Build core control and full-body strength through precise, low-impact mat work.',
      },
      {
        slug: 'core-pilates',
        name: 'Core Pilates',
        description: 'Strengthen deep core muscles with focused, controlled movement and breath.',
      },
      {
        slug: 'mobility-pilates',
        name: 'Mobility Pilates',
        description: 'Improve balance and range of motion with mindful Pilates sequences.',
      },
    ],
  },
  zumba: {
    slug: 'zumba',
    name: 'Zumba',
    tagline: 'Dance. Sweat. Repeat.',
    durationLabel: '40–55 mins',
    intensityLabel: 'Moderate–High',
    pricePaise: prices,
    formats: [
      {
        slug: 'zumba',
        name: 'Zumba',
        description: 'Follow upbeat dance combinations that keep you moving and lift your mood.',
      },
      {
        slug: 'bollywood-mix',
        name: 'Bollywood Mix',
        description: 'Bollywood-inspired choreography makes cardio feel joyful while you build stamina.',
      },
      {
        slug: 'dance-cardio',
        name: 'Dance Cardio',
        description: 'Easy-to-follow dance sequences build stamina while you move to upbeat music.',
      },
    ],
  },
};

const addresses: Address[] = [
  {
    id: 'addr-home',
    label: 'Home',
    line: 'A-1203, Rustomjee Seasons',
    area: 'Bandra West, Mumbai',
    pincode: '400050',
    isDefault: true,
    serviceable: true,
  },
];

const SLOT_TIMES = ['06:00', '07:00', '08:00', '09:00', '16:00', '17:00', '18:00', '19:00'];

function slotsFor(isoDate: string): TimeSlot[] {
  return SLOT_TIMES.map((time) => {
    const start = new Date(`${isoDate}T${time}:00`);
    return {
      id: `${isoDate}-${time}`,
      startsAt: start.toISOString(),
      label: formatClock(start),
      available: start.getTime() > Date.now(),
    };
  });
}

// ---------------------------------------------------------------------------
// Bookings. The change rule (2 hours) is a placeholder: see docs/open-questions.md, item 7.
// ---------------------------------------------------------------------------
const CHANGE_WINDOW_MS = 2 * 60 * 60 * 1000;

type BookingRecord = Omit<Booking, 'canChange'>;

const seedStart = new Date();
seedStart.setDate(seedStart.getDate() + 2);
seedStart.setHours(7, 0, 0, 0);

const bookingRecords: BookingRecord[] = [
  {
    id: 'mock-session-1',
    serviceSlug: 'yoga',
    serviceName: 'Yoga',
    formatName: 'Power Yoga',
    mode: 'scheduled',
    status: 'confirmed',
    startsAt: seedStart.toISOString(),
    whenLabel: formatWhen(seedStart.toISOString()),
    addressLabel: 'Home',
    areaLabel: 'Bandra West, Mumbai',
    totalPaise: prices.scheduled,
  },
];

// A session is treated as done one hour after it starts.
const SESSION_LENGTH_MS = 60 * 60 * 1000;
// Mock matching: an instant booking is "accepted" by a coach after this delay.
const MATCH_DELAY_MS = 15_000;
const MATCH_ARRIVAL_MS = 90 * 60 * 1000;

const matchTimers = new Map<string, number>();
const createdByKey = new Map<string, BookingResult>();

// Brings stored records up to date with the clock, the way the real API would.
function settle(): void {
  const now = Date.now();
  for (const record of bookingRecords) {
    if (record.status === 'confirmed' && record.startsAt) {
      if (new Date(record.startsAt).getTime() + SESSION_LENGTH_MS <= now) record.status = 'completed';
    }
    if (record.status === 'matching') {
      const created = matchTimers.get(record.id);
      if (created !== undefined && now - created >= MATCH_DELAY_MS) {
        const startsAt = new Date(now + MATCH_ARRIVAL_MS).toISOString();
        record.status = 'confirmed';
        record.startsAt = startsAt;
        record.whenLabel = formatWhen(startsAt);
        matchTimers.delete(record.id);
      }
    }
  }
}

function hasConflict(startsAt: string, ignoreId?: string): boolean {
  return bookingRecords.some(
    (record) =>
      record.id !== ignoreId &&
      (record.status === 'confirmed' || record.status === 'matching') &&
      record.startsAt === startsAt,
  );
}

function assertBookableSlot(startsAt: string | undefined, ignoreId?: string): string {
  if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) throw new ApiError('INVALID_REQUEST');
  if (new Date(startsAt).getTime() <= Date.now()) throw new ApiError('SLOT_UNAVAILABLE');
  if (hasConflict(startsAt, ignoreId)) throw new ApiError('SLOT_CONFLICT');
  return startsAt;
}

function isChangeable(record: BookingRecord): boolean {
  if (record.status === 'matching') return true;
  if (record.status !== 'confirmed' || !record.startsAt) return false;
  return new Date(record.startsAt).getTime() - Date.now() >= CHANGE_WINDOW_MS;
}

const toBooking = (record: BookingRecord): Booking => ({ ...record, canChange: isChangeable(record) });

function findRecord(id: string): BookingRecord {
  const record = bookingRecords.find((item) => item.id === id);
  if (!record) throw new ApiError('NOT_FOUND', `Unknown booking: ${id}`);
  return record;
}

function upcomingFromBookings(): HomeData['upcomingSession'] {
  settle();
  const active = bookingRecords
    .filter((record) => record.status === 'matching' || record.status === 'confirmed')
    .sort((a, b) => {
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      return aTime - bTime;
    });
  const next = active[0];
  if (!next) return null;
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  const doneThisWeek = bookingRecords.filter(
    (record) =>
      record.status === 'completed' &&
      record.startsAt !== null &&
      new Date(record.startsAt).getTime() >= weekStart.getTime(),
  ).length;
  return {
    id: next.id,
    serviceName: next.serviceName,
    whenLabel: next.whenLabel,
    sessionsDoneThisWeek: doneThisWeek,
    weeklyGoal: 3,
  };
}

export const mockApi: Api = {
  async getHome() {
    await wait(350);
    return { ...home, upcomingSession: upcomingFromBookings() };
  },

  async getService(slug) {
    await wait(200);
    const detail = serviceDetails[slug];
    if (!detail) throw new ApiError('NOT_FOUND', `Unknown service: ${slug}`);
    return detail;
  },

  async listAddresses() {
    await wait(150);
    return [...addresses];
  },

  async addAddress(input) {
    await wait(300);
    const duplicate = addresses.find(
      (item) =>
        item.line.trim().toLowerCase() === input.line.trim().toLowerCase() &&
        item.pincode === input.pincode.trim(),
    );
    if (duplicate) return duplicate;
    const created: Address = {
      id: `addr-${Date.now()}`,
      label: input.label.trim(),
      line: input.line.trim(),
      area: input.area.trim(),
      pincode: input.pincode.trim(),
      isDefault: false,
      // Mock rule: Mumbai PIN codes (400xxx) are inside an active cluster, everything else is not yet.
      serviceable: /^400\d{3}$/.test(input.pincode.trim()),
    };
    addresses.push(created);
    return created;
  },

  async getSlots(serviceSlug, isoDate) {
    await wait(200);
    return slotsFor(isoDate);
  },

  async createBooking(input) {
    await wait(600);
    settle();
    const replay = createdByKey.get(input.idempotencyKey);
    if (replay) return replay;
    const detail = serviceDetails[input.serviceSlug];
    if (!detail) throw new ApiError('NOT_FOUND', `Unknown service: ${input.serviceSlug}`);
    const address = addresses.find((item) => item.id === input.addressId);
    if (!address) throw new ApiError('ADDRESS_NOT_FOUND');
    if (!address.serviceable) throw new ApiError('NOT_SERVICEABLE');
    if (input.mode !== 'instant') assertBookableSlot(input.startsAt);
    const format = detail.formats.find((item) => item.slug === input.formatSlug) ?? detail.formats[0];
    const whenLabel =
      input.mode === 'instant'
        ? `Within ${home.instant.etaHours} hrs`
        : input.startsAt
          ? formatWhen(input.startsAt)
          : 'To be scheduled';
    const result: BookingResult = {
      id: `mock-${Date.now()}`,
      serviceName: detail.name,
      formatName: format?.name ?? detail.name,
      mode: input.mode,
      whenLabel,
      totalPaise: detail.pricePaise[input.mode],
    };
    bookingRecords.push({
      id: result.id,
      serviceSlug: detail.slug,
      serviceName: detail.name,
      formatName: result.formatName,
      mode: input.mode,
      status: input.mode === 'instant' ? 'matching' : 'confirmed',
      startsAt: input.mode === 'instant' ? null : (input.startsAt ?? null),
      whenLabel,
      addressLabel: address.label,
      areaLabel: address.area,
      totalPaise: result.totalPaise,
    });
    if (input.mode === 'instant') matchTimers.set(result.id, Date.now());
    createdByKey.set(input.idempotencyKey, result);
    return result;
  },

  async getBooking(id) {
    await wait(150);
    settle();
    return toBooking(findRecord(id));
  },

  async listBookings() {
    await wait(200);
    settle();
    return [...bookingRecords].reverse().map(toBooking);
  },

  async rescheduleBooking(id, startsAt) {
    await wait(400);
    settle();
    const record = findRecord(id);
    if (record.mode === 'instant' || !isChangeable(record)) throw new ApiError('CHANGE_WINDOW_CLOSED');
    assertBookableSlot(startsAt, id);
    record.startsAt = startsAt;
    record.whenLabel = formatWhen(startsAt);
    return toBooking(record);
  },

  async cancelBooking(id) {
    await wait(400);
    settle();
    const record = findRecord(id);
    if (!isChangeable(record)) throw new ApiError('CHANGE_WINDOW_CLOSED');
    record.status = 'cancelled';
    matchTimers.delete(id);
    return toBooking(record);
  },
};
