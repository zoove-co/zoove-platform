import { rupeesToPaise } from '@zoove/shared';

import { formatClock, formatWhen } from '@/lib/dates';

import type {
  Address,
  Api,
  Booking,
  BookingMode,
  BookingResult,
  HomeData,
  ServiceDetail,
  TimeSlot,
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

function isChangeable(record: BookingRecord): boolean {
  if (record.status === 'matching') return true;
  if (record.status !== 'confirmed' || !record.startsAt) return false;
  return new Date(record.startsAt).getTime() - Date.now() >= CHANGE_WINDOW_MS;
}

const toBooking = (record: BookingRecord): Booking => ({ ...record, canChange: isChangeable(record) });

function findRecord(id: string): BookingRecord {
  const record = bookingRecords.find((item) => item.id === id);
  if (!record) throw new Error(`Unknown booking: ${id}`);
  return record;
}

function upcomingFromBookings(): HomeData['upcomingSession'] {
  const active = bookingRecords
    .filter((record) => record.status === 'matching' || record.status === 'confirmed')
    .sort((a, b) => {
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      return aTime - bTime;
    });
  const next = active[0];
  if (!next) return null;
  return {
    id: next.id,
    serviceName: next.serviceName,
    whenLabel: next.whenLabel,
    sessionsDoneThisWeek: 2,
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
    if (!detail) throw new Error(`Unknown service: ${slug}`);
    return detail;
  },

  async listAddresses() {
    await wait(150);
    return [...addresses];
  },

  async addAddress(input) {
    await wait(300);
    const created: Address = {
      id: `addr-${Date.now()}`,
      label: input.label,
      line: input.line,
      area: input.area,
      pincode: input.pincode,
      isDefault: false,
      // Mock rule: Mumbai PIN codes (400xxx) are inside an active cluster, everything else is not yet.
      serviceable: input.pincode.startsWith('400'),
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
    const detail = serviceDetails[input.serviceSlug];
    if (!detail) throw new Error(`Unknown service: ${input.serviceSlug}`);
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
    const address = addresses.find((item) => item.id === input.addressId);
    bookingRecords.push({
      id: result.id,
      serviceSlug: detail.slug,
      serviceName: detail.name,
      formatName: result.formatName,
      mode: input.mode,
      status: input.mode === 'instant' ? 'matching' : 'confirmed',
      startsAt: input.mode === 'instant' ? null : (input.startsAt ?? null),
      whenLabel,
      addressLabel: address?.label ?? 'Home',
      areaLabel: address?.area ?? '',
      totalPaise: result.totalPaise,
    });
    return result;
  },

  async getBooking(id) {
    await wait(150);
    return toBooking(findRecord(id));
  },

  async listBookings() {
    await wait(200);
    return [...bookingRecords].reverse().map(toBooking);
  },

  async rescheduleBooking(id, startsAt) {
    await wait(400);
    const record = findRecord(id);
    if (record.mode === 'instant' || !isChangeable(record)) throw new Error('CHANGE_WINDOW_CLOSED');
    record.startsAt = startsAt;
    record.whenLabel = formatWhen(startsAt);
    return toBooking(record);
  },

  async cancelBooking(id) {
    await wait(400);
    const record = findRecord(id);
    if (!isChangeable(record)) throw new Error('CHANGE_WINDOW_CLOSED');
    record.status = 'cancelled';
    return toBooking(record);
  },
};
