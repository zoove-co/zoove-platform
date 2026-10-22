import { rupeesToPaise } from '@zoove/shared';

import { formatClock, formatWhen, toIsoDate } from '@/lib/dates';

import { isActiveStatus } from './status';

import {
  ApiError,
  type Address,
  type CoachRef,
  type PastCoach,
  type SessionPackage,
  type Profile,
  type ServiceabilityCheck,
  type AppNotification,
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

// Admin-managed in the real system (decision D13): price, discount, validity and badge are edited
// in the admin panel. Validity is left empty because it is still an open question (item 4).
const packages: SessionPackage[] = [6, 12, 24, 36].map((count, index) => {
  const price = [9000, 17000, 30000, 40000][index] ?? 0;
  return {
    id: `pkg-${count}`,
    name: `${count} sessions`,
    sessionsCount: count,
    pricePaise: rupeesToPaise(price),
    originalPricePaise: rupeesToPaise(1500 * count),
    validityDays: [28, 56, 112, 168][index] ?? null,
    badge: index === 0 ? 'Most popular' : null,
  };
});

const home: HomeData = {
  customerFirstName: null,
  locationLabel: null,
  locationServiceable: true,
  locationArea: null,
  hasUnreadNotifications: false,
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
  weekly: { done: 0, goal: 3 },
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

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

// Rough Greater Mumbai box, standing in for the cluster polygons.
function insideMumbai(lat: number | undefined, lng: number | undefined): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= 18.89 &&
    lat <= 19.33 &&
    lng >= 72.77 &&
    lng <= 72.99
  );
}

function isServiceable(input: ServiceabilityCheck): boolean {
  const { latitude, longitude } = input;
  if (typeof latitude === 'number' && typeof longitude === 'number') return insideMumbai(latitude, longitude);
  return /^400\d{3}$/.test(input.pincode.trim());
}

const addresses: Address[] = [
  {
    id: 'addr-home',
    label: 'Home',
    line: 'A-1203, Rustomjee Seasons',
    area: 'Bandra West, Mumbai',
    pincode: '400050',
    isDefault: true,
    latitude: 19.0596,
    longitude: 72.8295,
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
      available: start.getTime() > Date.now() && !hasConflict(start.toISOString()),
    };
  });
}

// ---------------------------------------------------------------------------
// Bookings. The change rule (2 hours) is a placeholder: see docs/open-questions.md, item 7.
// ---------------------------------------------------------------------------
const CHANGE_WINDOW_MS = 2 * 60 * 60 * 1000;

const COACHES: CoachRef[] = [
  { id: 'coach-aarav', name: 'Aarav S.' },
  { id: 'coach-meera', name: 'Meera K.' },
  { id: 'coach-rohan', name: 'Rohan P.' },
];

// Mock availability rule: Meera takes no sessions that start at 6 PM or later. The real API checks
// each coach's schedule and distance to the customer's address.
function coachAvailable(coachId: string, startsAt: string | null, busy: string[]): boolean {
  if (busy.includes(coachId)) return false;
  if (coachId === 'coach-meera' && startsAt && new Date(startsAt).getHours() >= 18) return false;
  return true;
}

function pickCoach(preferredId: string | undefined, startsAt: string | null, busy: string[]): CoachRef | null {
  const preferred = COACHES.find((item) => item.id === preferredId);
  if (preferred && coachAvailable(preferred.id, startsAt, busy)) return preferred;
  return COACHES.find((item) => coachAvailable(item.id, startsAt, busy)) ?? null;
}

type BookingRecord = Omit<Booking, 'canChange'> & {
  addressId: string | null;
  preferredCoachId?: string;
  // Coaches who cancelled this booking, so a replacement is never the same person.
  cancelledCoachIds: string[];
};

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
    addressId: 'addr-home',
    coach: COACHES[0] ?? null,
    cancelledCoachIds: [],
  },
  // A session already done, so "rebook a past coach" and the Past tab can be tried straight away.
  (() => {
    const done = new Date();
    done.setDate(done.getDate() - 1);
    done.setHours(7, 0, 0, 0);
    return {
      id: 'mock-session-0',
      serviceSlug: 'strength',
      serviceName: 'Strength',
      formatName: 'Strength Training',
      mode: 'scheduled' as const,
      status: 'completed' as const,
      startsAt: done.toISOString(),
      whenLabel: formatWhen(done.toISOString()),
      addressLabel: 'Home',
      areaLabel: 'Bandra West, Mumbai',
      totalPaise: prices.scheduled,
      addressId: 'addr-home',
      coach: COACHES[1] ?? null,
      cancelledCoachIds: [],
    };
  })(),
];

// A session is treated as done one hour after it starts.
const SESSION_LENGTH_MS = 60 * 60 * 1000;
// Mock matching: an instant booking is "accepted" by a coach after this delay.
const MATCH_DELAY_MS = 15_000;
const MATCH_ARRIVAL_MS = 90 * 60 * 1000;

const REMATCH_DELAY_MS = 20_000;

const matchTimers = new Map<string, number>();
const rematchTimers = new Map<string, number>();
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
        record.coach = pickCoach(record.preferredCoachId, startsAt, record.cancelledCoachIds);
        matchTimers.delete(record.id);
        notify(
          'Coach matched',
          `${record.coach?.name ?? 'Your coach'} will take your ${record.serviceName} session. ${record.whenLabel}.`,
          record.id,
        );
      }
    }
    if (record.status === 'rematching') {
      // No coach found before the session time: close it honestly instead of leaving it open forever.
      if (record.startsAt && new Date(record.startsAt).getTime() <= now) {
        record.status = 'cancelled';
        rematchTimers.delete(record.id);
        notify(
          'We could not find a coach',
          `We could not find a coach for your ${record.serviceName} session on ${record.whenLabel}. The session was cancelled.`,
          record.id,
        );
        continue;
      }
      const started = rematchTimers.get(record.id);
      if (started !== undefined && now - started >= REMATCH_DELAY_MS) {
        const replacement = pickCoach(record.preferredCoachId, record.startsAt, record.cancelledCoachIds);
        if (replacement) {
          record.coach = replacement;
          record.status = 'confirmed';
          rematchTimers.delete(record.id);
          notify(
            'New coach found',
            `${replacement.name} will take your ${record.serviceName} session on ${record.whenLabel}.`,
            record.id,
          );
        }
      }
    }
  }
}

function hasConflict(startsAt: string, ignoreId?: string): boolean {
  return bookingRecords.some(
    (record) =>
      record.id !== ignoreId &&
      isActiveStatus(record.status) &&
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
  // While we are finding a replacement coach the customer is never locked out of changing the booking.
  if (record.status === 'matching' || record.status === 'rematching') return true;
  if (record.status !== 'confirmed' || !record.startsAt) return false;
  return new Date(record.startsAt).getTime() - Date.now() >= CHANGE_WINDOW_MS;
}

const toBooking = (record: BookingRecord): Booking => {
  const { addressId: _a, preferredCoachId: _p, cancelledCoachIds: _c, ...rest } = record;
  void _a;
  void _p;
  void _c;
  return { ...rest, canChange: isChangeable(record) };
};

// ---------------------------------------------------------------------------
// Notifications: the real backend writes these from outbox events (booking confirmed, coach
// matched, cancelled). The mock does the same from inside the booking functions.
// ---------------------------------------------------------------------------
const notifications: AppNotification[] = [];

function notify(title: string, body: string, bookingId: string | null): void {
  notifications.unshift({
    id: `ntf-${Date.now()}-${notifications.length}`,
    title,
    body,
    createdAt: new Date().toISOString(),
    read: false,
    bookingId,
  });
}

function findRecord(id: string): BookingRecord {
  const record = bookingRecords.find((item) => item.id === id);
  if (!record) throw new ApiError('NOT_FOUND', `Unknown booking: ${id}`);
  return record;
}

const WEEKLY_GOAL = 3;

function completedThisWeek(): number {
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  return bookingRecords.filter(
    (record) =>
      record.status === 'completed' &&
      record.startsAt !== null &&
      new Date(record.startsAt).getTime() >= weekStart.getTime(),
  ).length;
}

function upcomingFromBookings(): HomeData['upcomingSession'] {
  settle();
  const active = bookingRecords
    .filter((record) => isActiveStatus(record.status))
    .sort((a, b) => {
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      return aTime - bTime;
    });
  const next = active[0];
  if (!next) return null;
  const doneThisWeek = completedThisWeek();
  return {
    id: next.id,
    serviceName: next.serviceName,
    whenLabel: next.whenLabel,
    status: next.status,
    sessionsDoneThisWeek: doneThisWeek,
    weeklyGoal: WEEKLY_GOAL,
  };
}

// ---------------------------------------------------------------------------
// Auth and profile. The real API sends an SMS and issues JWTs (decision D5). Mock rules:
// the code is always 123456, five wrong tries lock the code, a new code can be asked after 30 s.
// ---------------------------------------------------------------------------
const OTP_CODE = '123456';
const OTP_MAX_TRIES = 5;
const OTP_RESEND_SECONDS = 30;
const otpState = new Map<string, { tries: number; requestedAt: number }>();
const knownPhones = new Set<string>();
const profiles = new Map<string, Profile>();
let signedInPhone: string | null = null;

const isIndianMobile = (phone: string) => /^\+91[6-9]\d{9}$/.test(phone);

function currentProfile(): Profile | null {
  return signedInPhone ? (profiles.get(signedInPhone) ?? null) : null;
}

export const mockApi: Api = {
  setSession(token) {
    const prefix = 'mock-token-';
    if (token?.startsWith(prefix)) {
      const phone = token.slice(prefix.length);
      signedInPhone = phone;
      knownPhones.add(phone);
      if (!profiles.has(phone)) {
        profiles.set(phone, { phone, firstName: null, lastName: null, email: null });
      }
    } else {
      signedInPhone = null;
    }
  },

  async requestOtp(phone) {
    await wait(500);
    if (!isIndianMobile(phone)) throw new ApiError('INVALID_PHONE');
    const previous = otpState.get(phone);
    if (previous && Date.now() - previous.requestedAt < OTP_RESEND_SECONDS * 1000) {
      throw new ApiError('OTP_RATE_LIMITED');
    }
    otpState.set(phone, { tries: 0, requestedAt: Date.now() });
    return { resendAfterSeconds: OTP_RESEND_SECONDS };
  },

  async verifyOtp(phone, code) {
    await wait(500);
    const state = otpState.get(phone);
    if (!state) throw new ApiError('OTP_INVALID');
    if (state.tries >= OTP_MAX_TRIES) throw new ApiError('OTP_LOCKED');
    if (code !== OTP_CODE) {
      state.tries += 1;
      throw new ApiError(state.tries >= OTP_MAX_TRIES ? 'OTP_LOCKED' : 'OTP_INVALID');
    }
    otpState.delete(phone);
    const isNewUser = !knownPhones.has(phone);
    knownPhones.add(phone);
    if (!profiles.has(phone)) {
      profiles.set(phone, { phone, firstName: null, lastName: null, email: null });
    }
    signedInPhone = phone;
    return { token: `mock-token-${phone}`, isNewUser };
  },

  async getProfile() {
    await wait(150);
    const profile = currentProfile();
    if (!profile) throw new ApiError('NOT_FOUND');
    return { ...profile };
  },

  async updateProfile(input) {
    await wait(300);
    const profile = currentProfile();
    if (!profile) throw new ApiError('NOT_FOUND');
    const firstName = input.firstName.trim();
    if (firstName.length < 2) throw new ApiError('INVALID_REQUEST');
    profile.firstName = firstName;
    profile.lastName = input.lastName?.trim() || null;
    profile.email = input.email?.trim() || null;
    return { ...profile };
  },

  async getHome() {
    await wait(350);
    const upcomingSession = upcomingFromBookings();
    const current = addresses.find((item) => item.isDefault) ?? addresses[0];
    return {
      ...home,
      customerFirstName: currentProfile()?.firstName ?? null,
      locationLabel: current ? `${current.label} · ${current.area}` : null,
      locationServiceable: current?.serviceable ?? true,
      locationArea: current?.area ?? null,
      hasUnreadNotifications: notifications.some((item) => !item.read),
      upcomingSession,
      weekly: { done: completedThisWeek(), goal: WEEKLY_GOAL },
    };
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
    const lat = input.latitude;
    const lng = input.longitude;
    const pinned = typeof lat === 'number' && typeof lng === 'number';
    if (pinned && !isValidCoordinate(lat, lng)) throw new ApiError('INVALID_REQUEST');
    const created: Address = {
      id: `addr-${Date.now()}`,
      label: input.label.trim(),
      line: input.line.trim(),
      area: input.area.trim(),
      pincode: input.pincode.trim(),
      isDefault: false,
      latitude: pinned ? lat : null,
      longitude: pinned ? lng : null,
      // Mock rule: a pinned location must fall inside Greater Mumbai; otherwise a Mumbai PIN (400xxx)
      // counts. The real API checks the pin against the active cluster polygons (PostGIS).
      serviceable: isServiceable({ pincode: input.pincode, latitude: input.latitude, longitude: input.longitude }),
    };
    addresses.push(created);
    return created;
  },

  async checkServiceability(input) {
    await wait(250);
    return { serviceable: isServiceable(input) };
  },

  async setDefaultAddress(id) {
    await wait(200);
    if (!addresses.some((item) => item.id === id)) throw new ApiError('ADDRESS_NOT_FOUND');
    for (const item of addresses) item.isDefault = item.id === id;
    return [...addresses];
  },

  async deleteAddress(id) {
    await wait(250);
    settle();
    const index = addresses.findIndex((item) => item.id === id);
    if (index < 0) throw new ApiError('ADDRESS_NOT_FOUND');
    const inUse = bookingRecords.some(
      (record) => record.addressId === id && isActiveStatus(record.status),
    );
    if (inUse) throw new ApiError('ADDRESS_IN_USE');
    const [removed] = addresses.splice(index, 1);
    // Never leave the customer without a default while addresses exist.
    if (removed?.isDefault && addresses[0]) addresses[0].isDefault = true;
    return [...addresses];
  },

  async listNotifications() {
    await wait(150);
    settle();
    return notifications.map((item) => ({ ...item }));
  },

  async markNotificationsRead() {
    await wait(100);
    for (const item of notifications) item.read = true;
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
      addressId: address.id,
      preferredCoachId: input.preferredCoachId,
      coach: input.mode === 'instant' ? null : pickCoach(input.preferredCoachId, input.startsAt ?? null, []),
      cancelledCoachIds: [],
    });
    const created = bookingRecords[bookingRecords.length - 1];
    const wanted = COACHES.find((item) => item.id === input.preferredCoachId);
    if (wanted && created?.coach && created.coach.id !== wanted.id) {
      notify(
        'Coach changed',
        `${wanted.name} is not free at that time, so ${created.coach.name} will take your session.`,
        result.id,
      );
    }
    notify(
      input.mode === 'instant' ? 'Finding your coach' : 'Booking confirmed',
      input.mode === 'instant'
        ? `We are matching you for ${detail.name}.`
        : `${detail.name} on ${whenLabel}.`,
      result.id,
    );
    if (input.mode === 'instant') matchTimers.set(result.id, Date.now());
    createdByKey.set(input.idempotencyKey, result);
    return result;
  },

  async getBooking(id) {
    await wait(150);
    settle();
    return toBooking(findRecord(id));
  },

  async listPastCoaches() {
    await wait(150);
    settle();
    const byCoach = new Map<string, PastCoach>();
    const done = bookingRecords
      .filter((record) => record.status === 'completed' && record.coach)
      .sort((a, b) => new Date(b.startsAt ?? 0).getTime() - new Date(a.startsAt ?? 0).getTime());
    for (const record of done) {
      if (!record.coach) continue;
      const existing = byCoach.get(record.coach.id);
      if (existing) existing.sessionsTogether += 1;
      else
        byCoach.set(record.coach.id, {
          ...record.coach,
          sessionsTogether: 1,
          lastSessionLabel: record.whenLabel,
        });
    }
    return [...byCoach.values()];
  },

  async listPackages() {
    await wait(200);
    return packages.map((item) => ({ ...item }));
  },

  async getStreak() {
    await wait(250);
    settle();
    const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const todayIso = toIsoDate(new Date());
    const completed = bookingRecords.filter((r) => r.status === 'completed' && r.startsAt !== null);
    const onDay = (iso: string, list: BookingRecord[]) =>
      list.some((r) => r.startsAt !== null && toIsoDate(new Date(r.startsAt)) === iso);
    const active = bookingRecords.filter((r) => isActiveStatus(r.status) && r.startsAt !== null);

    const weekDays = WEEKDAY_LABELS.map((weekday, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const iso = toIsoDate(date);
      const state: 'completed' | 'booked' | 'none' = onDay(iso, completed)
        ? 'completed'
        : onDay(iso, active)
          ? 'booked'
          : 'none';
      return { iso, weekday, dayOfMonth: date.getDate(), state, isToday: iso === todayIso };
    });

    // Consecutive weeks (newest first) with at least one completed session. The current week only
    // counts if it already has one, but an empty current week does not break a running streak.
    const weekHas = (offset: number) => {
      const start = new Date(monday);
      start.setDate(start.getDate() - offset * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return completed.some((r) => {
        const time = new Date(r.startsAt as string).getTime();
        return time >= start.getTime() && time < end.getTime();
      });
    };
    let weekStreak = 0;
    for (let offset = weekHas(0) ? 0 : 1; weekHas(offset); offset += 1) weekStreak += 1;

    const bySlug = new Map<string, { serviceName: string; sessions: number }>();
    for (const r of completed) {
      const entry = bySlug.get(r.serviceSlug) ?? { serviceName: r.serviceName, sessions: 0 };
      entry.sessions += 1;
      bySlug.set(r.serviceSlug, entry);
    }
    const focusAreas = [...bySlug.entries()]
      .map(([serviceSlug, value]) => ({ serviceSlug, ...value }))
      .sort((a, b) => b.sessions - a.sessions);

    const recentSessions = [...completed]
      .sort((a, b) => new Date(b.startsAt as string).getTime() - new Date(a.startsAt as string).getTime())
      .slice(0, 3)
      .map(toBooking);

    return {
      weekDays,
      sessionsThisWeek: completedThisWeek(),
      weeklyGoal: WEEKLY_GOAL,
      totalSessions: completed.length,
      weekStreak,
      focusAreas,
      recentSessions,
    };
  },

  async getReferralCode() {
    await wait(150);
    // The real API issues a unique code per customer. Rewards are undecided (open question 10).
    return `ZOOVE${(signedInPhone ?? '0000').slice(-4)}`;
  },

  async savePartyPlan(input) {
    await wait(500);
    if (input.guests < 2 || input.guests > 30) throw new ApiError('INVALID_REQUEST');
    const plan = { ...input, id: `party-${Date.now()}`, createdAt: new Date().toISOString() };
    notify('Party plan saved', 'We will confirm coach availability and pricing for your group soon.', null);
    return plan;
  },

  dev: {
    async simulateTrainerCancel(id) {
      await wait(200);
      settle();
      const record = findRecord(id);
      if (record.status !== 'confirmed' || !record.coach) throw new ApiError('INVALID_REQUEST');
      record.cancelledCoachIds.push(record.coach.id);
      const gone = record.coach.name;
      record.coach = null;
      record.status = 'rematching';
      rematchTimers.set(id, Date.now());
      notify(
        'Your coach had to cancel',
        `${gone} can no longer take your ${record.serviceName} session on ${record.whenLabel}. We are finding another coach nearby and will tell you as soon as one accepts.`,
        id,
      );
    },
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
    if (record.status === 'rematching') {
      // New time, new search: give the replacement search a fresh start.
      rematchTimers.set(id, Date.now());
    } else if (record.coach && !coachAvailable(record.coach.id, startsAt, [])) {
      const previous = record.coach.name;
      record.coach = pickCoach(record.preferredCoachId, startsAt, record.cancelledCoachIds);
      notify(
        'Coach changed',
        record.coach
          ? `${previous} is not free at the new time, so ${record.coach.name} will take your session.`
          : `${previous} is not free at the new time. We are finding another coach nearby.`,
        id,
      );
      if (!record.coach) {
        record.status = 'rematching';
        rematchTimers.set(id, Date.now());
      }
    }
    notify('Session rescheduled', `${record.serviceName} is now on ${record.whenLabel}.`, id);
    return toBooking(record);
  },

  async cancelBooking(id) {
    await wait(400);
    settle();
    const record = findRecord(id);
    if (!isChangeable(record)) throw new ApiError('CHANGE_WINDOW_CLOSED');
    record.status = 'cancelled';
    matchTimers.delete(id);
    rematchTimers.delete(id);
    notify('Session cancelled', `Your ${record.serviceName} session was cancelled.`, id);
    return toBooking(record);
  },
};
