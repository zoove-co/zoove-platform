import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { PartyService } from './party.service';

const submitSchema = z.object({
  occasion: z.enum(['birthday', 'friends', 'family', 'team']),
  serviceSlug: z.string().min(1).max(60),
  guests: z.number().int().min(2).max(30),
  startsAt: z.iso.datetime({ offset: true }),
  addressId: z.uuid(),
  contactPhone: z.string().trim().regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number.'),
  contactName: z.string().trim().min(2).max(80).optional(),
  note: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(8).max(100),
});
const statusSchema = z.object({ status: z.enum(['new', 'contacted', 'confirmed', 'cancelled']), adminNote: z.string().trim().max(1000).optional() });
const idSchema = z.uuid();

@ApiTags('party')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('party-requests')
export class PartyController {
  constructor(private readonly party: PartyService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Ask for a party. The Zoove team is told and calls to confirm.' })
  submit(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(submitSchema)) body: z.infer<typeof submitSchema>) { return this.party.submit(user.id, body); }

  @Get()
  mine(@CurrentUser() user: AuthUser) { return this.party.mine(user.id); }
}

@ApiTags('admin-party')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@RequirePermission('parties.manage')
@Controller('admin/party-requests')
export class PartyAdminController {
  constructor(private readonly party: PartyService) {}

  @Get()
  list(@Query('status') status?: string) {
    const parsed = z.enum(['new', 'contacted', 'confirmed', 'cancelled']).safeParse(status);
    return this.party.adminList(parsed.success ? parsed.data : undefined);
  }

  @Post(':id/status')
  @HttpCode(200)
  setStatus(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(statusSchema)) body: z.infer<typeof statusSchema>) {
    return this.party.setStatus(user.id, id, body.status, body.adminNote);
  }
}
