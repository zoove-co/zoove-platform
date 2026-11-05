import { Module } from '@nestjs/common';

import { AddressesModule } from '../addresses/addresses.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { ProgressProfileService } from './progress-profile.service';
import { CustomerNotificationsService } from './notifications.service';

@Module({
  imports: [IdentityModule, AddressesModule, CatalogModule],
  controllers: [CustomerController],
  providers: [CustomerService, CustomerNotificationsService, ProgressProfileService],
})
export class CustomerModule {}
