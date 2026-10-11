import type { Paise } from '@zoove/shared';

// The contract between the app and the backend. The mock implements it today;
// an HTTP client generated from the NestJS OpenAPI spec will replace it (decision D11).

export type ApiErrorCode =
  | 'SLOT_UNAVAILABLE'
  | 'SLOT_CONFLICT'
  | 'NOT_SERVICEABLE'
  | 'ADDRESS_NOT_FOUND'
  | 'NOT_FOUND'
  | 'CHANGE_WINDOW_CLOSED'
  | 'INVALID_REQUEST';

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
  // False when the address is outside every active cluster (decision: cluster-gated launch).
  serviceable: boolean;
}

export interface NewAddress {
  label: string;
  line: string;
  area: string;
  pincode: string;
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

export type BookingStatus = 'matching' | 'confirmed' | 'completed' | 'cancelled';

export interface Booking {
  id: string;
  serviceSlug: string;
  serviceName: string;
  formatName: string;
  mode: BookingMode;
  status: BookingStatus;
  startsAt: string | null; // null for instant bookings until a coach accepts
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
  sessionsDoneThisWeek: number;
  weeklyGoal: number;
}

export interface HomeData {
  customerFirstName: string;
  locationLabel: string;
  hasUnreadNotifications: boolean;
  instant: { etaHours: number; pricePaise: Paise };
  scheduled: { pricePaise: Paise };
  demo: { pricePaise: Paise; originalPricePaise: Paise };
  services: ServiceSummary[];
  upcomingSession: UpcomingSessionSummary | null;
}

export interface Api {
  getHome(): Promise<HomeData>;
  getService(slug: string): Promise<ServiceDetail>;
  listAddresses(): Promise<Address[]>;
  addAddress(input: NewAddress): Promise<Address>;
  getSlots(serviceSlug: string, isoDate: string): Promise<TimeSlot[]>;
  createBooking(input: BookingInput): Promise<BookingResult>;
  getBooking(id: string): Promise<Booking>;
  listBookings(): Promise<Booking[]>;
  rescheduleBooking(id: string, startsAt: string): Promise<Booking>;
  cancelBooking(id: string): Promise<Booking>;
}
