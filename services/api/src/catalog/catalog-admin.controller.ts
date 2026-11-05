import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { CatalogAdminService } from './catalog-admin.service';

const idSchema = z.uuid();
const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes.').min(2).max(40);
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tagline: text(120),
  durationMinMinutes: z.number().int().min(10).max(240),
  durationMaxMinutes: z.number().int().min(10).max(240),
  intensity: text(30),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});
const newServiceSchema = serviceSchema.extend({ slug: slugSchema });
const formatSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: text(300),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});
const newFormatSchema = formatSchema.extend({ slug: slugSchema });
const priceSchema = z.object({
  serviceId: z.uuid().nullable(),
  mode: z.enum(['instant', 'scheduled', 'demo']),
  pricePaise: z.number().int().min(0).max(10_000_000).nullable(),
});
const ruleSchema = z.object({ percent: z.number().int().min(1).max(1000), perHead: z.boolean() });
const participantSchema = z.enum(['duo', 'loved_one', 'group']);

@ApiTags('admin-offerings')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@RequirePermission('catalog.manage')
@Controller('admin/offerings')
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogAdminService) {}

  @Get()
  list() { return this.catalog.list(); }

  @Post('services')
  @HttpCode(201)
  createService(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(newServiceSchema)) body: z.infer<typeof newServiceSchema>) {
    const { slug, ...input } = body;
    return this.catalog.saveService(user.id, null, slug, input);
  }

  @Post('services/:id')
  @HttpCode(200)
  updateService(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(serviceSchema)) body: z.infer<typeof serviceSchema>) {
    return this.catalog.saveService(user.id, id, null, body);
  }

  @Post('services/:id/formats')
  @HttpCode(201)
  createFormat(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(newFormatSchema)) body: z.infer<typeof newFormatSchema>) {
    const { slug, ...input } = body;
    return this.catalog.saveFormat(user.id, id, null, slug, input);
  }

  @Post('services/:id/formats/:formatId')
  @HttpCode(200)
  updateFormat(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Param('formatId', new ZodValidationPipe(idSchema)) formatId: string, @Body(new ZodValidationPipe(formatSchema)) body: z.infer<typeof formatSchema>) {
    return this.catalog.saveFormat(user.id, id, formatId, null, body);
  }

  @Put('prices')
  @HttpCode(200)
  async setPrice(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(priceSchema)) body: z.infer<typeof priceSchema>) {
    await this.catalog.setPrice(user.id, body.serviceId, body.mode, body.pricePaise);
    return this.catalog.list();
  }

  @Put('participants/:participant')
  @HttpCode(200)
  async setRule(@CurrentUser() user: AuthUser, @Param('participant', new ZodValidationPipe(participantSchema)) participant: string, @Body(new ZodValidationPipe(ruleSchema)) body: z.infer<typeof ruleSchema>) {
    await this.catalog.setParticipantRule(user.id, participant, body.percent, body.perHead);
    return this.catalog.list();
  }
}
