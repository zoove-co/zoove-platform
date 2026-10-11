import type { TrackedEvent, TrackedEventName } from '@zoove/shared';

// The single entry point for behaviour tracking (decision D6). Screens call track() and never
// talk to Firebase or CleverTap directly. Today it only logs in development; the adapters that
// write to our own event_log, Firebase and CleverTap plug in here later.
export function track(name: TrackedEventName, properties: TrackedEvent['properties'] = {}): void {
  const event: TrackedEvent = { name, properties, occurredAt: new Date().toISOString() };
  if (__DEV__) {
    console.log('[track]', event.name, JSON.stringify(event.properties));
  }
}
