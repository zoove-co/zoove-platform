import { Module } from '@nestjs/common';

import { AddressesModule } from '../addresses/addresses.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { PackagesModule } from '../packages/packages.module';
import { ReferralModule } from '../referral/referral.module';
import { IdentityModule } from '../identity/identity.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { SessionsAdminController } from './sessions-admin.controller';
import { SessionsAdminService } from './sessions-admin.service';

@Module({
  imports: [IdentityModule, CatalogModule, AddressesModule, DiscountsModule, PackagesModule, ReferralModule],
  controllers: [BookingsController, SessionsAdminController],
  providers: [BookingsService, SessionsAdminService],
})
export class BookingsModule {}
