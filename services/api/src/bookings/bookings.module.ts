import { Module } from '@nestjs/common';

import { AddressesModule } from '../addresses/addresses.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [IdentityModule, CatalogModule, AddressesModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
