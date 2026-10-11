import type { Paise } from '@zoove/shared';

// The contract between the app and the backend. The mock implements it today;
// an HTTP client generated from the NestJS OpenAPI spec will replace it (decision D11).

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
}

export interface BookingResult {
  id: string;
  serviceName: string;
  formatName: string;
  mode: BookingMode;
  whenLabel: string;
  totalPaise: Paise;
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
}
