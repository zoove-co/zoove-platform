import * as Sentry from '@sentry/node';

import type { ErrorContext, ErrorReporter } from './error-reporter';
import { scrubEvent } from './scrub';

export type SentrySettings = { dsn: string; environment: string; release?: string };

// Start Sentry. Call once, before the app is created, so start-up crashes are caught too.
export function initSentry(settings: SentrySettings): void {
  Sentry.init({
    dsn: settings.dsn,
    environment: settings.environment,
    release: settings.release,
    // Customers' phone numbers, emails, addresses and sign-in codes must never leave for a third party.
    // The SDK's defaults would attach request bodies, headers, cookies and query strings, so all are switched off.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    // Errors only for now. Performance tracing can be switched on later by setting a sample rate.
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
  });
}

export class SentryErrorReporter implements ErrorReporter {
  capture(error: unknown, context: ErrorContext = {}): void {
    try {
      Sentry.withScope((scope) => {
        if (context.method) scope.setTag('http.method', context.method);
        if (context.path) scope.setTag('http.path', context.path);
        // The id is an opaque uuid, not personal data. It lets you find the customer in the admin panel.
        if (context.userId) scope.setUser({ id: context.userId });
        Sentry.captureException(error);
      });
    } catch {
      // Monitoring failing must never turn into a customer-facing error.
    }
  }
}
