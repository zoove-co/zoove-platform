import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { AreasAdminService } from './areas-admin.service';

const idSchema = z.uuid();
const pincodeSchema = z.string().trim().regex(/^[1-9][0-9]{5}$/, 'A pincode has 6 digits.');
const nameSchema = z.string().trim().min(2).max(60);
const createSchema = z.object({
  name: nameSchema,
  city: z.string().trim().min(2).max(40).default('Mumbai'),
  pincodes: z.array(pincodeSchema).max(30).default([]),
  active: z.boolean().default(false),
});
const renameSchema = z.object({ name: nameSchema });
const statusSchema = z.object({ active: z.boolean() });
const addPincodeSchema = z.object({ pincode: pincodeSchema });

// Areas use the same permission as Offerings and prices: whoever sets what is sold also sets where it is sold.
@ApiTags('admin-areas')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@RequirePermission('catalog.manage')
@Controller('admin/areas')
export class AreasAdminController {
  constructor(private readonly areas: AreasAdminService) {}

  @Get()
  list() { return this.areas.list(); }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.areas.create(user.id, body);
  }

  @Post(':id')
  @HttpCode(200)
  async rename(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(renameSchema)) body: z.infer<typeof renameSchema>) {
    await this.areas.rename(user.id, id, body.name);
    return this.areas.list();
  }

  @Put(':id/status')
  @HttpCode(200)
  async setStatus(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(statusSchema)) body: z.infer<typeof statusSchema>) {
    await this.areas.setStatus(user.id, id, body.active);
    return this.areas.list();
  }

  @Post(':id/pincodes')
  @HttpCode(200)
  async addPincode(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(addPincodeSchema)) body: z.infer<typeof addPincodeSchema>) {
    await this.areas.addPincode(user.id, id, body.pincode);
    return this.areas.list();
  }

  @Delete(':id/pincodes/:pincode')
  @HttpCode(200)
  async removePincode(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Param('pincode', new ZodValidationPipe(pincodeSchema)) pincode: string) {
    await this.areas.removePincode(user.id, id, pincode);
    return this.areas.list();
  }
}
