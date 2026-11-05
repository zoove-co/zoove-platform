// What leaves Zoove for an analytics or marketing tool. Names follow docs/tracking-plan.md.
// Rules: ids and slugs only, money in paise, never a name, phone, email, address or health detail.
export type AnalyticsEvent = {
  /** Our event id, used to match results back to outbox rows. */
  id: string;
  name: string;
  /** Our user id (a uuid). Never a phone number or email. */
  userId: string;
  occurredAt: Date;
  properties: Record<string, string | number | boolean | null>;
};

export type DeliveryOutcome = { ok: true } | { ok: false; error: string; retryable: boolean };

// One implementation per tool (CleverTap, Firebase, a warehouse...). The dispatcher knows only this interface.
export interface EventDestination {
  readonly name: string;
  /** Returns one outcome per event, in the same order. Throws only if nothing could be attempted. */
  sendBatch(events: AnalyticsEvent[]): Promise<DeliveryOutcome[]>;
}

export const EVENT_DESTINATIONS = Symbol('EVENT_DESTINATIONS');
