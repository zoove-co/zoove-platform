import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { APP_CONFIG, type Env } from './config/env';
import { initSentry } from './monitoring/sentry-error-reporter';
import { configureApp } from './setup';

async function bootstrap(): Promise<void> {
  // Monitoring starts first so a crash while starting up is reported too.
  if (process.env.SENTRY_DSN) {
    initSentry({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? 'development', release: process.env.RENDER_GIT_COMMIT });
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const config = app.get<Env>(APP_CONFIG);
  await app.listen(config.PORT);
  new Logger('Bootstrap').log(`Zoove API listening on port ${config.PORT}`);
}

void bootstrap();
