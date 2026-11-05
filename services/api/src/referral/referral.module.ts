import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

@Module({ imports: [IdentityModule], controllers: [ReferralController], providers: [ReferralService], exports: [ReferralService] })
export class ReferralModule {}
