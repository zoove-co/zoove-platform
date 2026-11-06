import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { CustomersAdminController } from './customers-admin.controller';
import { CustomersAdminService } from './customers-admin.service';

@Module({ imports: [IdentityModule], controllers: [CustomersAdminController], providers: [CustomersAdminService] })
export class CustomersAdminModule {}
