// The one thing the rest of the API knows about error monitoring. Nothing else imports a monitoring vendor,
// so switching Sentry for another tool means writing one new class here and changing the provider in monitoring.module.ts.
export interface ErrorReporter {
  /** Report an unexpected failure. Never throws: monitoring must not break a request. */
  capture(error: unknown, context?: ErrorContext): void;
}

export type ErrorContext = { method?: string; path?: string; userId?: string };

export const ERROR_REPORTER = Symbol('ERROR_REPORTER');

// Used when no monitoring key is configured (local development, tests).
export class NoopErrorReporter implements ErrorReporter {
  capture(): void {}
}
