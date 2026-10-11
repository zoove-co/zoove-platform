import { mockApi } from './mock';
import type { Api } from './types';

// Switch to the HTTP client here once the NestJS API exists. Screens never import the mock.
export const api: Api = mockApi;

export { ApiError } from './types';
export type {
  ApiErrorCode,
  AppNotification,
  Address,
  Api,
  Booking,
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
  TimeSlot,
  UpcomingSessionSummary,
} from './types';
