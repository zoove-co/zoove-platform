import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

import { DomainError } from '../common/domain-error';
import { DatabaseService } from '../database/database.service';
import { TokenService } from './token.service';

export type AuthUser = { id: string; roles: string[] };
type AuthedRequest = Request & { user?: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw new DomainError('UNAUTHORIZED', 'Please sign in.');
    const claims = await this.tokens.verifyAccess(header.slice('Bearer '.length));
    // A token stays valid for minutes, but a blocked or deleted account must stop working at once.
    const active = await this.db.query(`select 1 from users where id = $1 and status = 'active'`, [claims.sub]);
    if (!active.rows[0]) throw new DomainError('UNAUTHORIZED', 'Please sign in again.');
    request.user = { id: claims.sub, roles: claims.roles };
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const request = context.switchToHttp().getRequest<AuthedRequest>();
  if (!request.user) throw new DomainError('UNAUTHORIZED', 'Please sign in.');
  return request.user;
});
