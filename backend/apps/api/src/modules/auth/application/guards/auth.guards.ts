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
} from '@nestjs/common';
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
