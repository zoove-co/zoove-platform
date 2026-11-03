import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { DiscountsAdminController } from './discounts-admin.controller';
import { DiscountsAdminService } from './discounts-admin.service';
import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';

@Module({
  imports: [IdentityModule, CatalogModule],
  controllers: [DiscountsController, DiscountsAdminController],
  providers: [DiscountsService, DiscountsAdminService],
  exports: [DiscountsService],
})
export class DiscountsModule {}
