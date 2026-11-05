import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { SessionsAdminService } from './sessions-admin.service';

const idSchema = z.uuid();
const listSchema = z.object({ filter: z.enum(['needs_trainer', 'upcoming', 'all']).default('needs_trainer'), q: z.string().trim().max(80).optional() });
const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) });
const noShowSchema = z.object({ note: z.string().trim().min(3).max(300) });
const moveSchema = z.object({ startsAt: z.iso.datetime({ offset: true }), reason: z.string().trim().min(3).max(300) });
const assignSchema = z.object({ trainerId: z.uuid() });

@ApiTags('admin-sessions')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@RequirePermission('sessions.manage')
@Controller('admin/sessions')
export class SessionsAdminController {
  constructor(private readonly sessions: SessionsAdminService) {}

  @Get('summary')
  summary() { return this.sessions.summary(); }

  @Get('trainers')
  trainers() { return this.sessions.trainers(); }

  @Get()
  list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.sessions.list(query.filter, query.q); }

  @Get(':id/available-trainers')
  available(@Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.sessions.availableTrainers(id); }

  @Get(':id')
  detail(@Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.sessions.detail(id); }

  @Post(':id/trainer-cancel')
  @HttpCode(200)
  trainerCancel(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(cancelSchema)) body: z.infer<typeof cancelSchema>) {
    return this.sessions.trainerCancel(user.id, 'admin', id, body.reason);
  }

  @Post(':id/no-show')
  @HttpCode(200)
  noShow(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(noShowSchema)) body: z.infer<typeof noShowSchema>) {
    return this.sessions.trainerNoShow(user.id, id, body.note);
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  reschedule(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(moveSchema)) body: z.infer<typeof moveSchema>) {
    return this.sessions.reschedule(user.id, id, body.startsAt, body.reason);
  }

  @Post(':id/assign')
  @HttpCode(200)
  assign(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(assignSchema)) body: z.infer<typeof assignSchema>) {
    return this.sessions.assign(user.id, id, body.trainerId);
  }
}
