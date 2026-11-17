import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { DomainError } from '../common/domain-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DatabaseService } from '../database/database.service';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { TrainerEarningsService } from './trainer-earnings.service';

const idSchema = z.uuid();
const payoutSchema = z.object({ paise: z.number().int().min(0).max(1_000_000).nullable() });

@ApiTags('admin-trainer-earnings')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@Controller('admin')
export class AdminTrainerEarningsController {
  constructor(private readonly earnings: TrainerEarningsService) {}

  @Get('trainer-payout')
  @RequirePermission('trainers.view')
  @ApiOperation({ summary: 'The flat amount a trainer earns per completed session (null = not set)' })
  payout() { return this.earnings.getPayout(); }

  @Put('trainer-payout')
  @RequirePermission('owner')
  @ApiOperation({ summary: 'Owners only: set the flat amount per completed session' })
  setPayout(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(payoutSchema)) body: z.infer<typeof payoutSchema>) { return this.earnings.setPayout(user.id, body.paise); }

  @Get('trainers/:applicationId/performance')
  @RequirePermission('trainers.view')
  @ApiOperation({ summary: 'One trainer: earnings, analytics and their live, upcoming and past sessions' })
  performance(@Param('applicationId', new ZodValidationPipe(idSchema)) applicationId: string) { return this.earnings.performance(applicationId); }
}

// For the trainer's own app.
@ApiTags('trainer-insights')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('trainer/insights')
export class TrainerInsightsController {
  constructor(private readonly earnings: TrainerEarningsService, private readonly db: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'My earnings and analytics: today, this week, this month, lifetime, and by service and session type' })
  async mine(@CurrentUser() user: AuthUser) {
    const t = await this.db.query(`select 1 from trainers where user_id = $1 and status = 'active'`, [user.id]);
    if (!t.rows[0]) throw new DomainError('FORBIDDEN', 'Only an active trainer can see this.');
    return this.earnings.insights(user.id, false);
  }
}
