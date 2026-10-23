import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({ imports: [IdentityModule], controllers: [TeamController], providers: [TeamService] })
export class TeamModule {}
