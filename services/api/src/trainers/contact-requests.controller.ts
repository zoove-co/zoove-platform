import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { ContactRequestsService } from './contact-requests.service';
import { PHONE_PATTERN, looksFakePhone } from './rules';

const idSchema = z.uuid();
const createSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('email'), value: z.string().trim().toLowerCase().email().max(120), reason: z.string().trim().max(300).optional() }),
  z.object({
    kind: z.literal('phone'),
    value: z.string().trim().regex(PHONE_PATTERN, 'Enter a 10-digit Indian mobile number').refine((v) => !looksFakePhone(v), 'Enter your real mobile number'),
    reason: z.string().trim().max(300).optional(),
  }),
]);
const listSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'all']).default('pending'), limit: z.coerce.number().int().min(1).max(200).default(50) });
const approveSchema = z.object({ note: z.string().trim().max(300).optional() });
const rejectSchema = z.object({ note: z.string().trim().min(3).max(300) });

@ApiTags('trainer-contact-requests')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('trainer/contact-requests')
export class TrainerContactRequestsController {
  constructor(private readonly requests: ContactRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'My recent requests to change my email or mobile number' })
  list(@CurrentUser() user: AuthUser) { return this.requests.listMine(user.id); }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Ask Zoove to change my sign-in email or my mobile number. Nothing changes until the team approves.' })
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) { return this.requests.create(user.id, body.kind, body.value, body.reason); }

  @Delete(':id')
  @ApiOperation({ summary: 'Withdraw an open request' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.requests.cancel(user.id, id); }
}

@ApiTags('admin-trainers')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@Controller('admin/trainer-contact-requests')
export class AdminContactRequestsController {
  constructor(private readonly requests: ContactRequestsService) {}

  @Get()
  @RequirePermission('trainers.view')
  @ApiOperation({ summary: 'Trainers asking to change their email or mobile. Open ones first.' })
  list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.requests.listAdmin(query.status, query.limit); }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('trainers.status')
  @ApiOperation({ summary: 'Approve after checking with the trainer: their email or mobile changes now (the email is their sign-in)' })
  approve(@CurrentUser() admin: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(approveSchema)) body: z.infer<typeof approveSchema>) { return this.requests.decide(admin.id, id, 'approved', body.note); }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('trainers.status')
  @ApiOperation({ summary: 'Reject with a reason the trainer will see' })
  reject(@CurrentUser() admin: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(rejectSchema)) body: z.infer<typeof rejectSchema>) { return this.requests.decide(admin.id, id, 'rejected', body.note); }
}
