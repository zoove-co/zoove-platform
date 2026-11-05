import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { PackagesService } from './packages.service';

const buySchema = z.object({ packageId: z.uuid(), idempotencyKey: z.string().min(8).max(100), discountCode: z.string().trim().min(3).max(40).optional() });
const idSchema = z.uuid();
const paidSchema = z.object({ method: z.enum(['upi', 'bank_transfer', 'cash', 'card', 'other']), reference: z.string().trim().min(2).max(100) });
const exceptionSchema = z.object({
  extraSessions: z.number().int().min(0).max(20).default(0),
  extendDays: z.number().int().min(0).max(90).default(0),
  reason: z.string().trim().min(3).max(300),
});
const savePackageSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sessionsCount: z.number().int().min(1).max(200),
  pricePaise: z.number().int().min(0).max(100_000_000),
  originalPricePaise: z.number().int().min(0).max(100_000_000).nullable().optional(),
  validityDays: z.number().int().min(1).max(1825).nullable().optional(),
  badge: z.string().trim().max(30).nullable().optional(),
  isActive: z.boolean().default(true),
}).refine((v) => v.originalPricePaise == null || v.originalPricePaise >= v.pricePaise, { message: 'The original price cannot be lower than the price.', path: ['originalPricePaise'] });

@ApiTags('packages')
@Controller()
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get('packages')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Active session packages' })
  list() { return this.packages.list(); }

  @Get('me/packages')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My package orders and remaining session credits' })
  mine(@CurrentUser() user: AuthUser) { return this.packages.mine(user.id); }

  @Post('me/packages')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(201)
  @ApiOperation({ summary: 'Order a package. It waits for payment until ops mark it paid.' })
  buy(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(buySchema)) body: z.infer<typeof buySchema>) { return this.packages.buy(user.id, body); }

  @Post('me/packages/:id/cancel')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  cancelMine(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.packages.cancelMine(user.id, id); }
}

@ApiTags('admin-packages')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@RequirePermission('packages.manage')
@Controller('admin')
export class PackagesAdminController {
  constructor(private readonly packages: PackagesService) {}

  @Get('package-orders')
  orders() { return this.packages.adminList(); }

  @Post('package-orders/:id/mark-paid')
  @HttpCode(200)
  markPaid(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(paidSchema)) body: z.infer<typeof paidSchema>) {
    return this.packages.markPaid(user.id, id, body);
  }

  @Post('package-orders/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.packages.adminCancel(user.id, id); }

  @Get('package-orders/:id/history')
  history(@Param('id', new ZodValidationPipe(idSchema)) id: string) { return this.packages.exceptionHistory(id); }

  @Post('package-orders/:id/exception')
  @HttpCode(200)
  exception(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(exceptionSchema)) body: z.infer<typeof exceptionSchema>) {
    return this.packages.grantException(user.id, id, body);
  }

  @Get('packages')
  catalog() { return this.packages.adminPackages(); }

  @Post('packages')
  @HttpCode(201)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(savePackageSchema)) body: z.infer<typeof savePackageSchema>) { return this.packages.adminSavePackage(user.id, null, body); }

  @Post('packages/:id')
  @HttpCode(200)
  update(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(savePackageSchema)) body: z.infer<typeof savePackageSchema>) {
    return this.packages.adminSavePackage(user.id, id, body);
  }
}
