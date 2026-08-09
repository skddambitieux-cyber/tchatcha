/**
 * TCHATCHA — Décorateur @CurrentUser() : renvoie `sub` posé par AuthGuard
 * (auth.guard.ts). Typé de façon optionnelle pour ne pas casser les routes
 * non gardées (33 §2.1 : undefined sans garde).
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from '../guards/auth.guard';

/** Factory (exportée pour les tests unitaires — 33 §2.1). */
export const currentUserFactory = (
  _data: unknown,
  ctx: ExecutionContext,
): string | undefined =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().currentUser;

export const CurrentUser = createParamDecorator(currentUserFactory);