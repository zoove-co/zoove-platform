import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { RolesGuard } from '../identity/roles.guard';
import { AdminTrainerApplicationsController } from './admin-trainer-applications.controller';
import { AdminTrainerApplicationsService } from './admin-trainer-applications.service';
import { AdminContactRequestsController, TrainerContactRequestsController } from './contact-requests.controller';
import { ContactRequestsService } from './contact-requests.service';
import { PiiService } from './pii.service';
import { TrainerApplicationsController } from './trainer-applications.controller';
import { TrainerApplicationsService } from './trainer-applications.service';

@Module({
  imports: [IdentityModule],
  controllers: [TrainerApplicationsController, AdminTrainerApplicationsController, TrainerContactRequestsController, AdminContactRequestsController],
  providers: [TrainerApplicationsService, AdminTrainerApplicationsService, ContactRequestsService, PiiService, RolesGuard],
})
export class TrainersModule {}
