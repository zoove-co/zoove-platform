import { Module } from '@nestjs/common';

import { DiscountsModule } from '../discounts/discounts.module';
import { IdentityModule } from '../identity/identity.module';
import { PackagesAdminController, PackagesController } from './packages.controller';
import { PackageRemindersService } from './package-reminders.service';
import { PackagesService } from './packages.service';

@Module({
  imports: [IdentityModule, DiscountsModule],
  controllers: [PackagesController, PackagesAdminController],
  providers: [PackagesService, PackageRemindersService],
  exports: [PackagesService, PackageRemindersService],
})
export class PackagesModule {}
