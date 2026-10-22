import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { DomainError } from '../common/domain-error';
import type { AuthUser } from './auth.guard';

const ROLES_KEY = 'zoove:roles';

// Use together with AuthGuard (AuthGuard first): @UseGuards(AuthGuard, RolesGuard) @Roles('admin')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const wanted = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!wanted || wanted.length === 0) return true;
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user) throw new DomainError('UNAUTHORIZED', 'Please sign in.');
    if (!user.roles.some((role) => wanted.includes(role))) throw new DomainError('FORBIDDEN', 'You do not have access to this.');
    return true;
  }
}
