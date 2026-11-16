import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AreasAdminController } from './areas-admin.controller';
import { AreasAdminService } from './areas-admin.service';

@Module({ imports: [IdentityModule], controllers: [AreasAdminController], providers: [AreasAdminService] })
export class AreasAdminModule {}
