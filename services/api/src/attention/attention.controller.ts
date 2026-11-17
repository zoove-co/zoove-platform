import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { AttentionService, type Attention } from './attention.service';

@ApiTags('admin-attention')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/attention')
export class AttentionController {
  constructor(private readonly attention: AttentionService) {}

  @Get()
  @ApiOperation({ summary: 'What needs the team now: sessions with no trainer, trainer cancellations, late starts, low ratings, waiting requests. Only the groups this admin may handle.' })
  get(@CurrentUser() user: AuthUser): Promise<Attention> {
    return this.attention.get(user.id);
  }
}
