/**
 * TCHATCHA — Port : gestion des tokens (JWT + refresh opaque) (28 §4).
 * JwtAdapter signe avec JWT_SECRET (HS256, claims sub/role/device_id/jti/exp=+900s).
 */
import { UserRole } from '../../domain/entities/user-role';

export interface TokenClaims {
  sub: string;
  role: UserRole;
  device_id: string;
  jti: string;
  exp: number;
}

export interface TokenManagerPort {
  signAccess(payload: TokenClaims): string;
  verifyAccess(token: string): TokenClaims;
}

export const TokenManagerPortToken = 'TokenManagerPort';
