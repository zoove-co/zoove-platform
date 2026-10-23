import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { AdminTrainerApplicationsService } from './admin-trainer-applications.service';

const listSchema = z.object({
  status: z.enum(['pending', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected']).optional(),
  search: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const idSchema = z.uuid();
const approveSchema = z.object({ note: z.string().trim().max(500).optional() });
const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const changesSchema = z.object({ note: z.string().trim().min(3).max(500), documentIds: z.array(z.uuid()).max(20).default([]) });

@ApiTags('admin-trainers')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@Controller('admin/trainer-applications')
export class AdminTrainerApplicationsController {
  constructor(private readonly admin: AdminTrainerApplicationsService) {}

  @Get()
  @RequirePermission('trainers.view')
  @ApiOperation({ summary: 'Trainer applications with counts per status. status=pending means submitted or in review.' })
  list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.admin.list({ ...(query.status ? { status: query.status } : {}), ...(query.search ? { search: query.search } : {}), limit: query.limit });
  }

  @Get(':id')
  @RequirePermission('trainers.view')
  @ApiOperation({ summary: 'One application with details, documents and history' })
  detail(@Param('id', new ZodValidationPipe(idSchema)) id: string) {
    return this.admin.detail(id);
  }

  @Get(':id/documents/:documentId/url')
  @RequirePermission('trainers.documents')
  @ApiOperation({ summary: 'A 5-minute private link to view one document. Every view is recorded.' })
  link(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Param('documentId', new ZodValidationPipe(idSchema)) documentId: string,
  ) {
    return this.admin.documentLink(admin.id, id, documentId);
  }

  @Post(':id/start-review')
  @HttpCode(200)
  @RequirePermission('trainers.decide')
  @ApiOperation({ summary: 'Mark that someone is looking at this application' })
  start(@CurrentUser() admin: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) {
    return this.admin.startReview(admin.id, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('trainers.decide')
  @ApiOperation({ summary: 'Approve: creates the trainer, gives the trainer role, emails the applicant' })
  approve(@CurrentUser() admin: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(approveSchema)) body: z.infer<typeof approveSchema>) {
    return this.admin.approve(admin.id, id, body.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('trainers.decide')
  @ApiOperation({ summary: 'Reject with a reason (final). The applicant is emailed.' })
  reject(@CurrentUser() admin: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(rejectSchema)) body: z.infer<typeof rejectSchema>) {
    return this.admin.reject(admin.id, id, body.reason);
  }

  @Post(':id/request-changes')
  @HttpCode(200)
  @RequirePermission('trainers.decide')
  @ApiOperation({ summary: 'Ask for fixes or extra information. Listed documents are marked for re-upload. The applicant is emailed.' })
  requestChanges(@CurrentUser() admin: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(changesSchema)) body: z.infer<typeof changesSchema>) {
    return this.admin.requestChanges(admin.id, id, body.note, body.documentIds);
  }
}
