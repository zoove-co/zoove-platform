import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AttentionController } from './attention.controller';
import { AttentionService } from './attention.service';

@Module({ imports: [IdentityModule], controllers: [AttentionController], providers: [AttentionService] })
export class AttentionModule {}
