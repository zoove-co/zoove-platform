import * as Sentry from '@sentry/react-native';

// The one place the app touches an error-monitoring vendor. To switch tools, change this file only.
// With no EXPO_PUBLIC_SENTRY_DSN (local development) nothing is sent.
const dsn = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();

export function initMonitoring(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    // Never attach phone numbers, emails or addresses to a report.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
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
