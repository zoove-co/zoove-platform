import type { Paise } from '@zoove/shared';

// The contract between the app and the backend. The mock implements it today;
// an HTTP client generated from the NestJS OpenAPI spec will replace it (decision D11).

export type ApiErrorCode =
  | 'SLOT_UNAVAILABLE'
  | 'SLOT_CONFLICT'
  | 'NOT_SERVICEABLE'
  | 'ADDRESS_NOT_FOUND'
  | 'ADDRESS_IN_USE'
  | 'NOT_FOUND'
  | 'CHANGE_WINDOW_CLOSED'
  | 'INVALID_REQUEST'
  | 'INVALID_PHONE'
  | 'OTP_INVALID'
  | 'OTP_LOCKED'
  | 'OTP_RATE_LIMITED';

// Every API failure carries a stable code so screens can show a specific message.
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
  }
}

export type BookingMode = 'instant' | 'scheduled' | 'demo';
export type Participant = 'personal' | 'duo' | 'loved_one' | 'group';

export interface ServiceSummary {
  slug: string;
  name: string;
}

export interface ServiceFormat {
  slug: string;
  name: string;
  description: string;
}

export interface ServiceDetail {
  slug: string;
  name: string;
  tagline: string;
  durationLabel: string;
  intensityLabel: string;
  formats: ServiceFormat[];
  pricePaise: Record<BookingMode, Paise>;
}

export interface Address {
  id: string;
  label: string;
  line: string;
  area: string;
  pincode: string;
  isDefault: boolean;
  // Where the coach should arrive. Null when the customer typed the address without a pin.
  latitude: number | null;
  longitude: number | null;
  // False when the address is outside every active cluster (decision: cluster-gated launch).
  serviceable: boolean;
}

export interface NewAddress {
  label: string;
  line: string;
  area: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
}

export interface TimeSlot {
  id: string;
  startsAt: string; // ISO 8601
  label: string;
  available: boolean;
}

export interface BookingInput {
  serviceSlug: string;
  formatSlug: string;
  mode: BookingMode;
  participant: Participant;
  addressId: string;
  startsAt?: string;
  // A coach the customer has had before. If not free at that time, another coach is matched.
  preferredCoachId?: string;
  // Same key = same booking. A retry after a dropped connection must never double-book.
  idempotencyKey: string;
}

export interface BookingResult {
  id: string;
  serviceName: string;
  formatName: string;
  mode: BookingMode;
  whenLabel: string;
  totalPaise: Paise;
}

// matching: instant booking waiting for the first coach. rematching: the coach cancelled and we are
// finding another one nearby. Both are "active": the customer still has a session coming.
export type BookingStatus = 'matching' | 'confirmed' | 'rematching' | 'completed' | 'cancelled';

export interface CoachRef {
  id: string;
  name: string;
}

// A coach the customer has had before (they can ask for the same coach again).
export interface PastCoach extends CoachRef {
  sessionsTogether: number;
  lastSessionLabel: string;
}

// Set in the admin panel by Pratik, admins and support (decision D13). The app only displays it.
export interface SessionPackage {
  id: string;
  name: string;
  sessionsCount: number;
  pricePaise: Paise;
  originalPricePaise: Paise | null; // shown struck through when higher than the price
  validityDays: number | null; // null = no expiry shown
  badge: string | null;
}

export interface Booking {
  id: string;
  serviceSlug: string;
  serviceName: string;
  formatName: string;
  mode: BookingMode;
  status: BookingStatus;
  startsAt: string | null; // null for instant bookings until a coach accepts
  coach: CoachRef | null; // null until a coach is assigned, and while we find a new one
  whenLabel: string;
  addressLabel: string;
  areaLabel: string;
  totalPaise: Paise;
  // Decided by the server (rule lives in the API, never in the app).
  canChange: boolean;
}

export interface UpcomingSessionSummary {
  id: string;
  serviceName: string;
  whenLabel: string;
  status: BookingStatus;
  sessionsDoneThisWeek: number;
  weeklyGoal: number;
}

export interface HomeData {
  // Null until the customer completes their profile in Account.
  customerFirstName: string | null;
  // The default address as shown in the Home header; null when the customer has none yet.
  locationLabel: string | null;
  locationServiceable: boolean;
  locationArea: string | null;
  hasUnreadNotifications: boolean;
  instant: { etaHours: number; pricePaise: Paise };
  scheduled: { pricePaise: Paise };
  demo: { pricePaise: Paise; originalPricePaise: Paise };
  services: ServiceSummary[];
  upcomingSession: UpcomingSessionSummary | null;
  weekly: { done: number; goal: number };
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string; // ISO 8601
  read: boolean;
  bookingId: string | null;
}

export interface ServiceabilityCheck {
  pincode: string;
  latitude?: number;
  longitude?: number;
}

export interface Profile {
  phone: string; // E.164, e.g. +919876543210
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface ProfileUpdate {
  firstName: string;
  lastName?: string;
  email?: string;
}

export interface OtpRequestResult {
  resendAfterSeconds: number;
}

export interface OtpVerifyResult {
  token: string;
  isNewUser: boolean;
}

export type PartyOccasion = 'birthday' | 'friends' | 'family' | 'team';

export interface PartyPlanInput {
  occasion: PartyOccasion;
  serviceSlug: string;
  guests: number;
  startsAt: string;
  addressId: string;
}

// A saved plan, not a booking: no price and no payment until the party rules are decided (open questions 35 to 43).
export interface PartyPlan extends PartyPlanInput {
  id: string;
  createdAt: string;
}

export type StreakDayState = 'completed' | 'booked' | 'none';

export interface StreakDay {
  iso: string;
  weekday: string;
  dayOfMonth: number;
  state: StreakDayState;
  isToday: boolean;
}

export interface FocusArea {
  serviceSlug: string;
  serviceName: string;
  sessions: number;
}

// Computed by the server. A "week streak" counts consecutive weeks with at least one completed session
// (assumption, open question 46). Streak data is always derived from bookings; the app never counts.
export interface StreakData {
  weekDays: StreakDay[];
  sessionsThisWeek: number;
  weeklyGoal: number;
  totalSessions: number;
  weekStreak: number;
  focusAreas: FocusArea[];
  recentSessions: Booking[];
}

export interface Api {
  // Tells the API which session this device holds (null = signed out).
  setSession(token: string | null): void;
  requestOtp(phone: string): Promise<OtpRequestResult>;
  verifyOtp(phone: string, code: string): Promise<OtpVerifyResult>;
  getProfile(): Promise<Profile>;
  updateProfile(input: ProfileUpdate): Promise<Profile>;
  getHome(): Promise<HomeData>;
  getService(slug: string): Promise<ServiceDetail>;
  listAddresses(): Promise<Address[]>;
  addAddress(input: NewAddress): Promise<Address>;
  // Lets the address form say "we are not here yet" before saving. Saving is always allowed.
  checkServiceability(input: ServiceabilityCheck): Promise<{ serviceable: boolean }>;
  setDefaultAddress(id: string): Promise<Address[]>;
  deleteAddress(id: string): Promise<Address[]>;
  listNotifications(): Promise<AppNotification[]>;
  markNotificationsRead(): Promise<void>;
  getSlots(serviceSlug: string, isoDate: string): Promise<TimeSlot[]>;
  createBooking(input: BookingInput): Promise<BookingResult>;
  getBooking(id: string): Promise<Booking>;
  listBookings(): Promise<Booking[]>;
  listPastCoaches(): Promise<PastCoach[]>;
  listPackages(): Promise<SessionPackage[]>;
  getStreak(): Promise<StreakData>;
  getReferralCode(): Promise<string>;
  savePartyPlan(input: PartyPlanInput): Promise<PartyPlan>;
  rescheduleBooking(id: string, startsAt: string): Promise<Booking>;
  // Development only: the mock implements it so the trainer-cancel flow can be tried by hand.
  dev?: { simulateTrainerCancel(id: string): Promise<void> };
  cancelBooking(id: string): Promise<Booking>;
}
