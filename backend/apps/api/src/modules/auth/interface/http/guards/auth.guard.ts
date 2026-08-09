/**
 * TCHATCHA — AuthGuard : authentifie via Bearer access JWT (6.3.1).
 * Dépend de TokenService.verifyAccess (lui-même délègue à TokenManagerPort).
 * En cas de réussite, pose `request.currentUser = claims.sub`.
 * Erreurs mappées par AuthExceptionsFilter : unauthorized / token_expired (30 §3.3).
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from '../../../application/services/token.service';
import { RefreshUnknownError } from '../../../domain/errors/auth-errors';

export interface AuthenticatedRequest extends Request {
  currentUser?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new RefreshUnknownError();
    }
    const claims = this.tokens.verifyAccess(authorization.slice(7));
    req.currentUser = claims.sub;
    return true;
  }
}