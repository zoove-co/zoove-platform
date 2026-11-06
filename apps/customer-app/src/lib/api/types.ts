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
  | 'NO_CREDITS'
  | 'PACKAGE_EXPIRES'
  | 'INVALID_STATE'
  | 'OTP_LOCKED'
  | 'OTP_RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'ACCOUNT_BLOCKED'
  | 'EMAIL_TAKEN'
  | 'EMAIL_FAILED'
  | 'SMS_FAILED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'CONSENT_REQUIRED'
  | 'DISCOUNT_INVALID'
  | 'DISCOUNT_EXPIRED'
  | 'DISCOUNT_USED'
  | 'DISCOUNT_NOT_APPLICABLE'
  | 'HAS_ACTIVE_BOOKINGS'
  | 'FORBIDDEN'
  | 'TOO_MANY_REQUESTS'
  | 'NOT_AVAILABLE' // the feature has no backend yet
  | 'NETWORK' // no connection, or the server did not answer in time
  | 'INTERNAL';

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
  // Duo, Loved one and Group are a share of the Personal price (placeholder numbers until the business decides).
  participantRules: Record<string, ParticipantRule>;
}

export interface ParticipantRule {
  percent: number;
  perHead: boolean; // Group: the percent applies to each person
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

export interface Recipient {
  name: string;
  phone: string; // +91XXXXXXXXXX
}

// A discount code checked for one session: what comes off and what is left to pay. Worked out by the server.
export interface DiscountQuote {
  code: string;
  label: string; // "50% off"
  listPaise: Paise;
  discountPaise: Paise;
  totalPaise: Paise;
}

export interface BookingInput {
  serviceSlug: string;
  formatSlug: string;
  mode: BookingMode;
  participant: Participant;
  groupSize?: number; // Group: how many people (3 to 30)
  recipient?: Recipient; // Loved one: who the session is for
  addressId: string;
  startsAt?: string;
  // A coach the customer has had before. If not free at that time, another coach is matched.
  preferredCoachId?: string;
  discountCode?: string;
  // Pay with one credit from a paid package instead of money.
  useCredit?: boolean;
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
  participant: Participant;
  groupSize: number | null;
  recipient: Recipient | null;
  status: BookingStatus;
  startsAt: string | null; // null for instant bookings until a coach accepts
  coach: CoachRef | null; // null until a coach is assigned, and while we find a new one
  whenLabel: string;
  addressLabel: string;
  areaLabel: string;
  totalPaise: Paise; // what the customer pays, after any discount
  discountPaise: Paise;
  discountCode: string | null;
  paidWithCredit: boolean;
  // Short code the customer and the Zoove team both use for this session, for example ZV-3F9A21BC.
  sessionCode: string;
  // The coach cancelled and we are finding another one (status rematching). The customer can wait, reschedule or cancel.
  trainerCancelled: boolean;
  // The start time has passed and there is no coach on the session. The customer can move it or cancel it.
  overdue: boolean;
  // Decided by the server (rule lives in the API, never in the app).
  canChange: boolean;
  inProgress: boolean; // live: the coach entered the start code
  startedAt: string | null;
  // Shown to the customer to hand to the coach: the start code on arrival (until the session is live), then the finish code.
  startCode: string | null;
  endCode: string | null;
  rating: number | null; // 1 to 5 once the customer rated the coach
  canRate: boolean; // a finished session not rated yet
}

export interface UpcomingSessionSummary {
  id: string;
  serviceName: string;
  whenLabel: string;
  status: BookingStatus;
  sessionsDoneThisWeek: number;
  weeklyGoal: number;
  inProgress: boolean;
  upcomingCount: number; // all active sessions, so the home bar can say "+N more"
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
  phone: string | null; // E.164, e.g. +919876543210. Null when the customer signed in with email.
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

// What the device keeps. The access token is short lived; the refresh token (single use) gets a new pair.
export interface Session {
  accessToken: string;
  refreshToken: string;
}

export interface OtpVerifyResult {
  session: Session;
  isNewUser: boolean;
}

export type PartyOccasion = 'birthday' | 'friends' | 'family' | 'team';

export interface PartyPlanInput {
  occasion: PartyOccasion;
  serviceSlug: string;
  guests: number;
  startsAt: string;
  addressId: string;
  // The number our team calls to confirm. +91 and ten digits.
  contactPhone: string;
  contactName?: string;
  note?: string;
  // Same key = same request, so a retry never sends the team two requests.
  idempotencyKey: string;
}

// A request, not a booking: no price and no payment. The Zoove team calls to confirm (decision D16).
export type PartyStatus = 'new' | 'contacted' | 'confirmed' | 'cancelled';
export interface PartyPlan {
  id: string;
  occasion: PartyOccasion;
  serviceSlug: string;
  guests: number;
  startsAt: string;
  status: PartyStatus;
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

export interface PackagePurchase {
  id: string;
  name: string;
  sessionsCount: number;
  listPricePaise: Paise;
  discountPaise: Paise;
  discountCode: string | null;
  totalPaise: Paise;
  status: 'awaiting_payment' | 'paid' | 'cancelled';
  creditsLeft: number;
  creditsTotal: number;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}
export interface MyPackages {
  purchases: PackagePurchase[];
  credits: { creditsLeft: number; nextExpiry: string | null };
}

export interface RewardOffer {
  worth: string; // "10% off"
  validDays: number;
}

export interface MyReward {
  code: string;
  side: 'referrer' | 'friend';
  worth: string;
  state: 'unused' | 'used' | 'expired' | 'switched_off';
  expiresAt: string | null;
}

export interface ReferralSummary {
  code: string;
  signedUp: number;
  booked: number;
  referredBy: boolean;
  // What a referral earns right now (null = switched off, promise nothing) and this customer's own reward codes.
  offer: { referrer: RewardOffer | null; friend: RewardOffer | null };
  rewards: MyReward[];
}

export type FitnessGoal = 'lose_weight' | 'build_strength' | 'stay_active' | 'flexibility' | 'stress_relief';
export interface ProgressProfile {
  goal: FitnessGoal | null;
  targetDaysPerWeek: number | null;
  heightCm: number | null;
  weightKg: number | null;
  // Height and weight are kept only while this is true.
  healthConsent: boolean;
}

export interface Api {
  // Tells the API which session this device holds (null = signed out).
  setSession(session: Session | null): void;
  // Called when the API swaps tokens in the background, or when the session is no longer valid (null).
  onSessionChange(listener: (session: Session | null) => void): () => void;
  // Sign-in by emailed code is what the app uses today; the phone (SMS) pair is kept for when SMS is approved.
  requestEmailOtp(email: string): Promise<OtpRequestResult>;
  // acceptedTerms: the customer ticked "I agree to the Terms and Privacy Policy". A new customer is refused without it.
  verifyEmailOtp(email: string, code: string, acceptedTerms?: boolean): Promise<OtpVerifyResult>;
  requestOtp(phone: string): Promise<OtpRequestResult>;
  verifyOtp(phone: string, code: string): Promise<OtpVerifyResult>;
  // Best effort: tells the server to forget this device's session.
  logout(): Promise<void>;
  getProfile(): Promise<Profile>;
  updateProfile(input: ProfileUpdate): Promise<Profile>;
  // Wipes the personal details and ends every sign-in. Refused (HAS_ACTIVE_BOOKINGS) while a session is upcoming.
  deleteAccount(): Promise<void>;
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
  /** Tell the server this phone can receive push messages (or no longer should). */
  registerDevice(token: string, platform: 'ios' | 'android'): Promise<void>;
  removeDevice(token: string): Promise<void>;
  getSlots(serviceSlug: string, isoDate: string): Promise<TimeSlot[]>;
  // Checks a discount code for a session and returns the new total. Nothing is used up until the booking is made.
  previewDiscount(input: { code: string; serviceSlug: string; mode: BookingMode }): Promise<DiscountQuote>;
  createBooking(input: BookingInput): Promise<BookingResult>;
  getBooking(id: string): Promise<Booking>;
  listBookings(): Promise<Booking[]>;
  listPastCoaches(): Promise<PastCoach[]>;
  listPackages(): Promise<SessionPackage[]>;
  getStreak(): Promise<StreakData>;
  getReferral(): Promise<ReferralSummary>;
  // A friend's code, once, before the first booking.
  applyReferralCode(code: string): Promise<void>;
  getMyPackages(): Promise<MyPackages>;
  // Orders the package; it waits for payment until our team marks it paid.
  buyPackage(input: { packageId: string; discountCode?: string; idempotencyKey: string }): Promise<PackagePurchase>;
  cancelPackageOrder(id: string): Promise<PackagePurchase>;
  getProgressProfile(): Promise<ProgressProfile>;
  saveProgressProfile(input: ProgressProfile): Promise<ProgressProfile>;
  savePartyPlan(input: PartyPlanInput): Promise<PartyPlan>;
  rescheduleBooking(id: string, startsAt: string): Promise<Booking>;
  // Development only: the mock implements it so the trainer-cancel flow can be tried by hand.
  dev?: { simulateTrainerCancel(id: string): Promise<void> };
  cancelBooking(id: string): Promise<Booking>;
  rateBooking(id: string, stars: number, comment?: string): Promise<Booking>;
}
