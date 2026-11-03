import { USE_MOCK } from '@/lib/config';

import { httpApi } from './http';
import { mockApi } from './mock';
import type { Api } from './types';

// The real HTTP client talks to the Zoove API (address in EXPO_PUBLIC_API_URL). The mock is development only.
// Screens never import either one directly.
export const api: Api = USE_MOCK ? mockApi : httpApi;

export { ApiError } from './types';
export type {
  ApiErrorCode,
  CoachRef,
  OtpRequestResult,
  FocusArea,
  PastCoach,
  StreakData,
  StreakDay,
  StreakDayState,
  PartyOccasion,
  PartyPlan,
  PartyPlanInput,
  SessionPackage,
  OtpVerifyResult,
  Profile,
  ProfileUpdate,
  ServiceabilityCheck,
  AppNotification,
  Address,
  Api,
  Booking,
  DiscountQuote,
  BookingInput,
  BookingMode,
  BookingResult,
  BookingStatus,
  HomeData,
  NewAddress,
  Participant,
  ServiceDetail,
  ServiceFormat,
  ServiceSummary,
  Session,
  TimeSlot,
  UpcomingSessionSummary,
} from './types';
