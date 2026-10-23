import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import type { AuthUser } from './auth.guard';
import type { Permission } from './permissions';

const PERMISSION_META = 'zoove:permission';

// Use after AuthGuard and RolesGuard: @UseGuards(AuthGuard, RolesGuard, PermissionGuard) @Roles('admin')
// then @RequirePermission('trainers.view') on a route, or @RequirePermission('owner') for owners only.
export const RequirePermission = (permission: Permission | 'owner') => SetMetadata(PERMISSION_META, permission);

// Read from the database on every request, so switching someone off or changing their role takes effect immediately.
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const wanted = this.reflector.getAllAndOverride<Permission | 'owner' | undefined>(PERMISSION_META, [context.getHandler(), context.getClass()]);
    if (!wanted) return true;
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user) throw new DomainError('UNAUTHORIZED', 'Please sign in.');
    const result = await this.db.query<{ is_owner: boolean; permissions: string[] }>(`select is_owner, permissions from admin_profiles where user_id = $1`, [user.id]);
    const profile = result.rows[0];
    if (!profile) throw new DomainError('FORBIDDEN', 'This account is not on the admin team. Ask an owner to add you.');
    if (profile.is_owner) return true;
    if (wanted === 'owner' || !profile.permissions.includes(wanted)) throw new DomainError('FORBIDDEN', 'You do not have access to this. Ask an owner to turn it on for you.');
    return true;
  }
}
