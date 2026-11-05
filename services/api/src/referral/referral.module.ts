import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { RewardsAdminController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({ imports: [IdentityModule], controllers: [ReferralController, RewardsAdminController], providers: [ReferralService, RewardsService], exports: [ReferralService, RewardsService] })
export class ReferralModule {}
