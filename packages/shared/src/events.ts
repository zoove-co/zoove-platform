// Tracking plan (draft). Names are snake_case, object_action, past tense for completed actions.
// Every screen action goes through one track() adapter that fans out to our own event_log,
// Firebase and CleverTap. Keep this file and docs/tracking-plan.md in sync.
export const TRACKED_EVENTS = [
  'app_opened',
  'otp_requested',
  'otp_verified',
  'service_viewed',
  'service_selected',
  'slot_selected',
  'address_confirmed',
  'booking_started',
  'booking_abandoned',
  'booking_confirmed',
  'payment_failed',
  'session_completed',
  'booking_rescheduled',
  'booking_cancelled',
  'packages_viewed',
  'academy_viewed',
  'notifications_opened',
  'orders_viewed',
  'booking_repeated',
  'past_coach_selected',
  'package_selected',
  'banner_tapped',
  'party_viewed',
  'party_plan_saved',
  'streak_viewed',
  'account_viewed',
  'profile_completed',
  'signed_out',
] as const;

export type TrackedEventName = (typeof TRACKED_EVENTS)[number];

export interface TrackedEvent {
  name: TrackedEventName;
  properties?: Record<string, string | number | boolean | null>;
  occurredAt: string; // ISO 8601, UTC
}
