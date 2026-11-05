import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogAdminService } from './catalog-admin.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PricingService } from './pricing.service';

@Module({
  imports: [IdentityModule],
  controllers: [CatalogController, CatalogAdminController],
  providers: [CatalogService, PricingService, CatalogAdminService],
  exports: [CatalogService, PricingService],
})
export class CatalogModule {}
