import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CurrentUser, type AuthUser } from '../identity/auth.guard';
import { PermissionGuard, RequirePermission } from '../identity/permission.guard';
import { PERMISSIONS, PERMISSION_KEYS } from '../identity/permissions';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { TeamService } from './team.service';

const idSchema = z.uuid();
const permissionList = z.array(z.enum(PERMISSION_KEYS)).max(20);
const addSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  jobTitle: z.string().trim().min(2).max(60),
  reportsTo: z.uuid().nullable().optional(),
  permissions: permissionList.default([]),
  isOwner: z.boolean().optional(),
});
const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    jobTitle: z.string().trim().min(2).max(60).optional(),
    reportsTo: z.uuid().nullable().optional(),
    permissions: permissionList.optional(),
    isOwner: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), { message: 'Send at least one field to change.' });

@ApiTags('admin-team')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard, PermissionGuard)
@Roles('admin')
@Controller('admin')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('me')
  @ApiOperation({ summary: 'The signed-in admin: name, role, who they report to and what they may do' })
  async me(@CurrentUser() user: AuthUser) {
    return { ...(await this.team.me(user.id)), catalog: PERMISSIONS };
  }

  @Get('team')
  @RequirePermission('owner')
  @ApiOperation({ summary: 'Everyone on the admin team, plus the list of permission switches (owners only)' })
  async list() {
    return { members: await this.team.list(), permissions: PERMISSIONS };
  }

  @Post('team')
  @HttpCode(201)
  @RequirePermission('owner')
  @ApiOperation({ summary: 'Add a team member. They are emailed and can then sign in with their email (owners only)' })
  add(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(addSchema)) body: z.infer<typeof addSchema>) {
    return this.team.add(user.id, body);
  }

  @Patch('team/:id')
  @RequirePermission('owner')
  @ApiOperation({ summary: 'Change a member: role, reports to, permission switches, owner, or switch them off (owners only)' })
  update(@CurrentUser() user: AuthUser, @Param('id', new ZodValidationPipe(idSchema)) id: string, @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>) {
    return this.team.update(user.id, id, body);
  }
}
