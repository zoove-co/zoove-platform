import { Global, Module } from '@nestjs/common';

import { APP_CONFIG, type Env } from '../config/env';
import { ERROR_REPORTER, NoopErrorReporter } from './error-reporter';
import { SentryErrorReporter } from './sentry-error-reporter';

// Chooses the reporter from configuration. No SENTRY_DSN means errors are only written to the log, as before.
@Global()
@Module({
  providers: [
    {
      provide: ERROR_REPORTER,
      inject: [APP_CONFIG],
      useFactory: (config: Env) => (config.SENTRY_DSN ? new SentryErrorReporter() : new NoopErrorReporter()),
    },
  ],
  exports: [ERROR_REPORTER],
})
export class MonitoringModule {}
