import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { APP_CONFIG, type Env } from './config/env';

// Shared by main.ts and the tests, so tests run the same app that production runs.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<Env>(APP_CONFIG);

  // Behind a load balancer the real client address is in X-Forwarded-For; needed for per-IP limits.
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
  app.enableShutdownHooks();

  if (config.SWAGGER_ENABLED) enableDocs(app);
}

function enableDocs(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Zoove API').setVersion('0.1.0').addBearerAuth().build(),
  );
  // /docs is the page; /docs-json is the spec the apps' API client is generated from (decision D11).
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
}
