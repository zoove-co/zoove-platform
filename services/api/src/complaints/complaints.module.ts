import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AdminComplaintsController, CustomerComplaintsController, TrainerComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';

@Module({ imports: [IdentityModule], controllers: [CustomerComplaintsController, TrainerComplaintsController, AdminComplaintsController], providers: [ComplaintsService] })
export class ComplaintsModule {}
