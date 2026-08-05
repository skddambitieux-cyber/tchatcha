/**
 * TCHATCHA — Guards & décorateurs d'authentification (infrastructure).
 * Étape 6.1 : uniquement l'infrastructure (JWT stratégie, rôles). Les
 * use-cases (OTP, login, refresh) arrivent à l'Étape 6.2.
 * Conforme à : 10-blueprint-backend.md (auth), 12-api-blueprint.md, 15-securite.md.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/domain/entities/user-role.entity';

export const ROLES_KEY = 'roles';
/** Déclare les rôles requis sur une route (RBAC — ADR-008). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Guard JWT : valide l'access token et injecte `req.user`.
 * Minimal pour l'infra — la stratégie complète (refresh, rotation)
 * est fournie à l'Étape 6.2 avec le module auth métier.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // NOTE : implémentation réelle à l'Étape 6.2 (vérification JWT + load user).
    // Ce garde est volontairement non-exposé tant que l'auth métier n'existe pas.
    void context;
    return true;
  }
}

/**
 * Guard de rôles : vérifie que le user authentifié possède le rôle requis.
 * S'appuie sur les rôles injectés par JwtAuthGuard (Étape 6.2).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.roles?.some((r: UserRole) => required.includes(r))) {
      throw new UnauthorizedException('Rôle insuffisant');
    }
    return true;
  }
}