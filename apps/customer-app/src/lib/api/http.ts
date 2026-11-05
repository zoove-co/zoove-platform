import { API_URL } from '@/lib/config';

import {
  ApiError,
  type Address,
  type Api,
  type ApiErrorCode,
  type AppNotification,
  type Booking,
  type BookingResult,
  type DiscountQuote,
  type HomeData,
  type MyPackages,
  type PackagePurchase,
  type PartyPlan,
  type ProgressProfile,
  type ReferralSummary,
  type OtpRequestResult,
  type OtpVerifyResult,
  type PastCoach,
  type Profile,
  type ServiceDetail,
  type Session,
  type SessionPackage,
  type StreakData,
  type TimeSlot,
} from './types';

const TIMEOUT_MS = 20_000;

const KNOWN_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  'SLOT_UNAVAILABLE', 'SLOT_CONFLICT', 'NOT_SERVICEABLE', 'ADDRESS_NOT_FOUND', 'ADDRESS_IN_USE', 'NOT_FOUND',
  'CHANGE_WINDOW_CLOSED', 'INVALID_REQUEST', 'INVALID_PHONE', 'OTP_INVALID', 'OTP_LOCKED', 'OTP_RATE_LIMITED',
  'UNAUTHORIZED', 'ACCOUNT_BLOCKED', 'EMAIL_TAKEN', 'EMAIL_FAILED', 'SMS_FAILED', 'IDEMPOTENCY_KEY_REUSED',
  'TOO_MANY_REQUESTS', 'NOT_AVAILABLE', 'NETWORK', 'INTERNAL', 'CONSENT_REQUIRED', 'HAS_ACTIVE_BOOKINGS', 'FORBIDDEN',
  'DISCOUNT_INVALID', 'DISCOUNT_EXPIRED', 'DISCOUNT_USED', 'DISCOUNT_NOT_APPLICABLE',
  'NO_CREDITS', 'INVALID_STATE', 'PACKAGE_EXPIRES',
]);

type TokenReply = { token: string; refreshToken: string; expiresInSeconds: number; isNewUser?: boolean };
type CatalogItem = {
  slug: string;
  name: string;
  tagline: string | null;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  intensity: string | null;
  formats: { slug: string; name: string; description: string | null }[];
  pricePaise: Record<'instant' | 'scheduled' | 'demo', number | null>;
  participantRules?: Record<string, { percent: number; perHead: boolean }>;
};

let session: Session | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(next: Session | null) => void>();

function setAndAnnounce(next: Session | null): void {
  session = next;
  for (const listener of listeners) listener(next);
}

async function send<T>(method: string, path: string, body: unknown, bearer: string | null): Promise<{ status: number; data: T | null; error: ApiError | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (response.ok) return { status: response.status, data: json as T, error: null };
    const failure = (json as { error?: { code?: string; message?: string } } | null)?.error;
    const code: ApiErrorCode = failure?.code && KNOWN_CODES.has(failure.code) ? (failure.code as ApiErrorCode) : response.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL';
    return { status: response.status, data: null, error: new ApiError(code, failure?.message) };
  } catch {
    // No connection, DNS failure, or no answer within the time limit.
    return { status: 0, data: null, error: new ApiError('NETWORK') };
  } finally {
    clearTimeout(timer);
  }
}

// One refresh at a time: when several requests hit an expired token together, they share one refresh,
// because a refresh token works only once.
function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const current = session;
  if (!current) return Promise.resolve(false);
  refreshing = (async () => {
    const result = await send<TokenReply>('POST', '/v1/auth/refresh', { refreshToken: current.refreshToken }, null);
    if (result.data) {
      setAndAnnounce({ accessToken: result.data.token, refreshToken: result.data.refreshToken });
      return true;
    }
    // Only a clear "no" from the server ends the session. A dropped connection keeps it for the next try.
    if (result.error && result.error.code !== 'NETWORK' && result.status >= 400 && result.status < 500) setAndAnnounce(null);
    return false;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function call<T>(method: string, path: string, body?: unknown, authed = true): Promise<T> {
  const used = authed ? (session?.accessToken ?? null) : null;
  const first = await send<T>(method, path, body, used);
  if (first.data !== null || !first.error) return first.data as T;
  if (authed && first.error.code === 'UNAUTHORIZED' && session) {
    // Someone else may already have refreshed while this request was in flight.
    const renewed = session.accessToken !== used || (await refreshSession());
    if (renewed && session) {
      const second = await send<T>(method, path, body, session.accessToken);
      if (second.error) throw second.error;
      return second.data as T;
    }
  }
  throw first.error;
}

const toSession = (reply: TokenReply): OtpVerifyResult => ({
  session: { accessToken: reply.token, refreshToken: reply.refreshToken },
  isNewUser: reply.isNewUser === true,
});

function durationLabel(min: number, max: number): string {
  return min === max ? `${min} mins` : `${min}–${max} mins`;
}

export const httpApi: Api = {
  setSession(next) {
    session = next;
  },
  onSessionChange(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  requestEmailOtp: (email) => call<OtpRequestResult>('POST', '/v1/auth/email-otp/request', { email: email.trim(), audience: 'customer' }, false),
  verifyEmailOtp: async (email, code, acceptedTerms) => toSession(await call<TokenReply>('POST', '/v1/auth/email-otp/verify', { email: email.trim(), code, audience: 'customer', acceptedTerms: acceptedTerms === true }, false)),
  requestOtp: (phone) => call<OtpRequestResult>('POST', '/v1/auth/otp/request', { phone }, false),
  verifyOtp: async (phone, code) => toSession(await call<TokenReply>('POST', '/v1/auth/otp/verify', { phone, code, audience: 'customer' }, false)),

  async logout() {
    const current = session;
    if (!current) return;
    // The device is signed out either way; this only tells the server to forget the session.
    await send('POST', '/v1/auth/logout', { refreshToken: current.refreshToken }, null);
  },

  getProfile: () => call<Profile>('GET', '/v1/me'),
  updateProfile: (input) => call<Profile>('PATCH', '/v1/me', input),
  deleteAccount: async () => {
    await call<unknown>('DELETE', '/v1/me');
  },
  getHome: () => call<HomeData>('GET', '/v1/home'),

  async getService(slug): Promise<ServiceDetail> {
    const list = await call<CatalogItem[]>('GET', '/v1/services', undefined, false);
    const item = list.find((entry) => entry.slug === slug);
    if (!item) throw new ApiError('NOT_FOUND', `Unknown service: ${slug}`);
    return {
      slug: item.slug,
      name: item.name,
      tagline: item.tagline ?? '',
      durationLabel: durationLabel(item.durationMinMinutes, item.durationMaxMinutes),
      intensityLabel: item.intensity ?? '',
      formats: item.formats.map((format) => ({ slug: format.slug, name: format.name, description: format.description ?? '' })),
      pricePaise: { instant: item.pricePaise.instant ?? 0, scheduled: item.pricePaise.scheduled ?? 0, demo: item.pricePaise.demo ?? 0 },
      participantRules: item.participantRules ?? {},
    };
  },

  listAddresses: () => call<Address[]>('GET', '/v1/addresses'),
  addAddress: (input) => call<Address>('POST', '/v1/addresses', input),
  checkServiceability: (input) => call<{ serviceable: boolean }>('POST', '/v1/addresses/serviceability', input),
  setDefaultAddress: (id) => call<Address[]>('PUT', `/v1/addresses/${encodeURIComponent(id)}/default`),
  deleteAddress: (id) => call<Address[]>('DELETE', `/v1/addresses/${encodeURIComponent(id)}`),

  listNotifications: () => call<AppNotification[]>('GET', '/v1/notifications'),
  async markNotificationsRead() {
    await call<void>('POST', '/v1/notifications/read');
  },

  async registerDevice(token, platform) {
    await call<void>('POST', '/v1/me/devices', { token, platform });
  },
  async removeDevice(token) {
    await call<void>('DELETE', '/v1/me/devices', { token });
  },

  getSlots: (serviceSlug, isoDate) => call<TimeSlot[]>('GET', `/v1/slots?service=${encodeURIComponent(serviceSlug)}&date=${encodeURIComponent(isoDate)}`),

  previewDiscount: (input) => call<DiscountQuote>('POST', '/v1/discounts/preview', input),

  async createBooking(input): Promise<BookingResult> {
    const booking = await call<Booking>('POST', '/v1/bookings', input);
    return { id: booking.id, serviceName: booking.serviceName, formatName: booking.formatName, mode: booking.mode, whenLabel: booking.whenLabel, totalPaise: booking.totalPaise };
  },
  getBooking: (id) => call<Booking>('GET', `/v1/bookings/${encodeURIComponent(id)}`),
  listBookings: () => call<Booking[]>('GET', '/v1/bookings'),
  rescheduleBooking: (id, startsAt) => call<Booking>('POST', `/v1/bookings/${encodeURIComponent(id)}/reschedule`, { startsAt }),
  cancelBooking: (id) => call<Booking>('POST', `/v1/bookings/${encodeURIComponent(id)}/cancel`),

  listPastCoaches: () => call<PastCoach[]>('GET', '/v1/coaches/past'),
  listPackages: () => call<SessionPackage[]>('GET', '/v1/packages'),
  getStreak: () => call<StreakData>('GET', '/v1/streak'),

  savePartyPlan: (input) => call<PartyPlan>('POST', '/v1/party-requests', input),
  getReferral: () => call<ReferralSummary>('GET', '/v1/referral'),
  async applyReferralCode(code) {
    await call<unknown>('POST', '/v1/referral/apply', { code });
  },
  getMyPackages: () => call<MyPackages>('GET', '/v1/me/packages'),
  buyPackage: (input) => call<PackagePurchase>('POST', '/v1/me/packages', input),
  cancelPackageOrder: (id) => call<PackagePurchase>('POST', `/v1/me/packages/${encodeURIComponent(id)}/cancel`),
  getProgressProfile: () => call<ProgressProfile>('GET', '/v1/me/progress-profile'),
  saveProgressProfile: (input) => call<ProgressProfile>('PUT', '/v1/me/progress-profile', input),
};
