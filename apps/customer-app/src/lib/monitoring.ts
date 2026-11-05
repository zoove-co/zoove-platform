import * as Sentry from '@sentry/react-native';

// The one place the app touches an error-monitoring vendor. To switch tools, change this file only.
// With no EXPO_PUBLIC_SENTRY_DSN (local development) nothing is sent.
const dsn = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();

// Even if an error message carries a customer's email or phone by mistake, it is removed before it leaves the phone.
// (The API has the same function in services/api/src/monitoring/scrub.ts.)
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const TOKEN = /\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
export const scrubText = (value: string): string => value.replace(TOKEN, '[token]').replace(EMAIL, '[email]').replace(PHONE, '[phone]');

export function initMonitoring(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    // Never attach phone numbers, emails or addresses to a report.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
    beforeSend: (event) => {
      if (event.message) event.message = scrubText(event.message);
      for (const v of event.exception?.values ?? []) if (v.value) v.value = scrubText(v.value);
      for (const b of event.breadcrumbs ?? []) if (b.message) b.message = scrubText(b.message);
      return event;
    },
  });
}

/** Report a handled-but-unexpected failure. Safe to call when monitoring is off. */
export function reportError(error: unknown, where?: string): void {
  if (!dsn) return;
  Sentry.withScope((scope) => {
    if (where) scope.setTag('where', where);
    Sentry.captureException(error);
  });
}

/** Wrap the root component so crashes in the screens are caught. */
export const withMonitoring = (component: React.ComponentType): React.ComponentType =>
  dsn ? (Sentry.wrap(component as React.ComponentType<Record<string, unknown>>) as React.ComponentType) : component;

/** Tag reports with the signed-in customer (an opaque id, never phone or email). Pass null on sign-out. */
export function setMonitoringUser(id: string | null): void {
  if (!dsn) return;
  Sentry.setUser(id ? { id } : null);
}
