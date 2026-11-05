import { Module } from '@nestjs/common';

import { AddressesModule } from '../addresses/addresses.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { PackagesModule } from '../packages/packages.module';
import { ReferralModule } from '../referral/referral.module';
import { IdentityModule } from '../identity/identity.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { OverdueSweepService } from './overdue-sweep.service';
import { SessionsAdminController } from './sessions-admin.controller';
import { SessionsAdminService } from './sessions-admin.service';
import { TrainerJobsController } from './trainer-jobs.controller';
import { TrainerJobsService } from './trainer-jobs.service';

@Module({
  imports: [IdentityModule, CatalogModule, AddressesModule, DiscountsModule, PackagesModule, ReferralModule],
  controllers: [BookingsController, SessionsAdminController, TrainerJobsController],
  providers: [BookingsService, SessionsAdminService, OverdueSweepService, TrainerJobsService],
  exports: [OverdueSweepService],
})
export class BookingsModule {}
