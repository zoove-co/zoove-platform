import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { DiscountsAdminService } from './discounts-admin.service';

const createSchema = z
  .object({
    // Leave out to get a random code. A made-up one is 4 to 20 letters and numbers.
    code: z.string().trim().max(30).optional(),
    kind: z.enum(['percent', 'flat']),
    percentOff: z.number().int().min(1).max(100).optional(),
    flatOffPaise: z.number().int().min(100).max(10_000_000).optional(),
    maxDiscountPaise: z.number().int().min(100).max(10_000_000).optional(),
    reason: z.enum(['goodwill', 'emergency', 'misconduct', 'referral', 'promo', 'other']),
    note: z.string().trim().max(500).optional(),
    // Give the code to one customer only.
    customerEmail: z.string().trim().toLowerCase().pipe(z.email().max(200)).optional(),
    maxRedemptions: z.number().int().min(1).max(100_000).default(1),
    perUserLimit: z.number().int().min(1).max(100_000).default(1),
    minOrderPaise: z.number().int().min(0).max(10_000_000).default(0),
    appliesTo: z.enum(['any', 'session', 'package']).default('any'),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'percent' && value.percentOff === undefined) ctx.addIssue({ code: 'custom', path: ['percentOff'], message: 'Enter the percent off.' });
    if (value.kind === 'percent' && value.flatOffPaise !== undefined) ctx.addIssue({ code: 'custom', path: ['flatOffPaise'], message: 'A percent code has no flat amount.' });
    if (value.kind === 'flat' && value.flatOffPaise === undefined) ctx.addIssue({ code: 'custom', path: ['flatOffPaise'], message: 'Enter the amount off.' });
    if (value.kind === 'flat' && (value.percentOff !== undefined || value.maxDiscountPaise !== undefined)) ctx.addIssue({ code: 'custom', path: ['kind'], message: 'A flat code has no percent or cap.' });
    if (value.perUserLimit > value.maxRedemptions) ctx.addIssue({ code: 'custom', path: ['perUserLimit'], message: 'Per customer cannot be more than the total uses.' });
  });
const idSchema = z.uuid();

@ApiTags('admin-discounts')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@RequirePermission('discounts.manage')
@Controller('admin/discount-codes')
export class DiscountsAdminController {
  constructor(private readonly admin: DiscountsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'All discount codes, newest first, with how many times each was used' })
  list() {
    return this.admin.list();
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Make a discount code (percent or flat amount off). Random unless you give one. Optionally for one customer only.' })
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.admin.create(user.id, body);
  }

  @Post(':id/disable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Switch a code off. Bookings that already used it are not changed.' })
  disable(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) {
    return this.admin.disable(user.id, id);
  }
}
