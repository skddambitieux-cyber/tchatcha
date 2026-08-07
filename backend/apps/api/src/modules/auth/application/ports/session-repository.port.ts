/**
 * TCHATCHA — Port : sessions longues (authz.refresh_tokens, 06a §1).
 * Le token en clair n'est jamais stocké : seul le hash SHA-256 part en base.
 * Rotation par famille (ADR-004) : chaque usage remplace l'ancien, une
 * réutilisation d'un token révoqué → révocation de toute la famille (D4).
 */
export interface RefreshSession {
  userId: string;
  tokenHash: string;
  deviceId: string;
  ip: string;
  userAgent: string | null;
  expiresAt: Date;
}

export interface StoredRefreshSession {
  id: string;
  userId: string;
  tokenHash: string;
  deviceId: string;
  ip: string;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

export interface ActiveSession {
  id: string;
  device_id: string;
  ip: string;
  user_agent: string | null;
  created_at: Date;
  expires_at: Date;
}

export interface SessionRepositoryPort {
  save(session: RefreshSession): Promise<string>;
  findByTokenHash(tokenHash: string): Promise<StoredRefreshSession | null>;
  /** Rotation : révoque l'ancien et pose replaced_by (chaîne de famille). */
  markRotated(oldId: string, newId: string): Promise<void>;
  /** Révocation de toute la famille d'un user (rejeu détecté, D4). */
  revokeAllForUser(userId: string): Promise<void>;
  /** Révocation ciblée d'un refresh (logout, idempotent). */
  revokeByTokenHash(tokenHash: string): Promise<boolean>;
  /** Sessions actives (revoked_at IS NULL et expires_at > now) d'un user. */
  listActive(userId: string): Promise<ActiveSession[]>;
}

export const SessionRepositoryPortToken = 'SessionRepositoryPort';