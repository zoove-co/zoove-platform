import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { RewardsService, type RewardSide } from './rewards.service';

const sideSchema = z.enum(['referrer', 'friend']);
const ruleSchema = z.object({
  enabled: z.boolean(),
  kind: z.enum(['flat', 'percent']).nullable(),
  flatOffPaise: z.number().int().min(100).max(10_000_000).nullable(),
  percentOff: z.number().int().min(1).max(100).nullable(),
  maxDiscountPaise: z.number().int().min(100).max(10_000_000).nullable(),
  validDays: z.number().int().min(1).max(365),
});

@ApiTags('admin-rewards')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@RequirePermission('rewards.manage')
@Controller('admin/rewards')
export class RewardsAdminController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  async overview() { return { rules: await this.rewards.rules(), issued: await this.rewards.issued(), stats: await this.rewards.stats() }; }

  @Put(':side')
  @HttpCode(200)
  async save(@CurrentUser() user: AuthUser, @Param('side', new ZodValidationPipe(sideSchema)) side: RewardSide, @Body(new ZodValidationPipe(ruleSchema)) body: z.infer<typeof ruleSchema>) {
    await this.rewards.saveRule(user.id, side, body);
    return this.overview();
  }

  @Post('issued/:id/switch-off')
  @HttpCode(200)
  async switchOff(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(z.uuid())) id: string) {
    await this.rewards.switchOff(user.id, id);
    return this.overview();
  }
}
