import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ConfigModule } from './config/config.module';
import { APP_CONFIG, type Env } from './config/env';
import { AddressesModule } from './addresses/addresses.module';
import { BookingsModule } from './bookings/bookings.module';
import { CatalogModule } from './catalog/catalog.module';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { TrainersModule } from './trainers/trainers.module';

// Modular monolith (decision D4): each module owns its tables and exposes services, never raw SQL on
// another module's tables. A module can be pulled out into its own service later.
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Env) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        // Tests fire many requests from one address; production and development stay limited.
        skipIf: () => config.NODE_ENV === 'test',
      }),
    }),
    HealthModule,
    StorageModule,
    EmailModule,
    IdentityModule,
    CatalogModule,
    AddressesModule,
    BookingsModule,
    TrainersModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
