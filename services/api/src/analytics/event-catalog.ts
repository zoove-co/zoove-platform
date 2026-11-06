import type { AnalyticsEvent } from './analytics-event';

// The facts about the thing that happened, read from our own tables at send time (not copied from the outbox payload,
// which may hold personal details). Add a field here only if it is safe to share and a journey needs it.
export type Facts = {
  userId: string;
  properties: AnalyticsEvent['properties'];
};

export type Aggregate = 'booking' | 'package_purchase' | 'user' | 'party_request';

type Entry = {
  /** Event name in docs/tracking-plan.md. */
  name: string;
  aggregate: Aggregate;
  /** Extra properties taken from the outbox payload. Only list keys that are safe to share. */
  fromPayload?: (payload: Record<string, unknown>) => AnalyticsEvent['properties'];
};

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// Which outbox events become analytics events. Anything not listed here is internal (trainer onboarding, team, admin
// changes) and is never sent. To send a new event: add a line here, add it to docs/tracking-plan.md, tell Pratik.
export const EVENT_CATALOG: Record<string, Entry> = {
  'booking.created': { name: 'booking_confirmed', aggregate: 'booking' },
  'booking.rescheduled': { name: 'booking_rescheduled', aggregate: 'booking' },
  'booking.cancelled': { name: 'booking_cancelled', aggregate: 'booking', fromPayload: (p) => ({ cancelled_by: str(p.by) }) },
  'booking.trainer_assigned': { name: 'coach_assigned', aggregate: 'booking' },
  'booking.trainer_cancelled': { name: 'coach_cancelled', aggregate: 'booking' },
  'booking.overdue': { name: 'session_overdue', aggregate: 'booking' },
  'booking.unfilled': { name: 'session_unfilled', aggregate: 'booking' },
  'booking.started': { name: 'session_started', aggregate: 'booking' },
  'booking.rated': { name: 'session_rated', aggregate: 'booking', fromPayload: (p) => ({ stars: typeof p.stars === 'number' ? p.stars : null }) },
  'booking.completed': { name: 'session_completed', aggregate: 'booking' },
  'package.ordered': { name: 'package_ordered', aggregate: 'package_purchase' },
  'package.marked_paid': { name: 'package_paid', aggregate: 'package_purchase' },
  'referral.reward_granted': { name: 'reward_granted', aggregate: 'user', fromPayload: (p) => ({ reward_side: str(p.side) }) },
  'party.requested': { name: 'party_requested', aggregate: 'party_request' },
};
