import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { CustomersAdminService } from './customers-admin.service';

const listSchema = z.object({ q: z.string().trim().max(80).optional() });
const idSchema = z.uuid();

@ApiTags('admin-customers')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@RequirePermission('customers.view')
@Controller('admin/customers')
export class CustomersAdminController {
  constructor(private readonly customers: CustomersAdminService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.customers.list(query.q);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) {
    return this.customers.detail(user.id, id);
  }
}
