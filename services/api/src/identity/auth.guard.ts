import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

import { DomainError } from '../common/domain-error';
import { TokenService } from './token.service';

export type AuthUser = { id: string; roles: string[] };
type AuthedRequest = Request & { user?: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw new DomainError('UNAUTHORIZED', 'Please sign in.');
    const claims = await this.tokens.verifyAccess(header.slice('Bearer '.length));
    request.user = { id: claims.sub, roles: claims.roles };
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const request = context.switchToHttp().getRequest<AuthedRequest>();
  if (!request.user) throw new DomainError('UNAUTHORIZED', 'Please sign in.');
  return request.user;
});
