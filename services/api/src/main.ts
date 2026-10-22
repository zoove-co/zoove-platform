import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { APP_CONFIG, type Env } from './config/env';
import { configureApp } from './setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const config = app.get<Env>(APP_CONFIG);
  await app.listen(config.PORT);
  new Logger('Bootstrap').log(`Zoove API listening on port ${config.PORT}`);
}

void bootstrap();
