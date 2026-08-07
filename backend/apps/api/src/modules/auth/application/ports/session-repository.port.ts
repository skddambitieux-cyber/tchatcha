/**
 * TCHATCHA — Port : sessions longues (authz.refresh_tokens, 06a §1).
 * Le token en clair n'est jamais stocké : seul le hash SHA-256 part en base.
 */
export interface RefreshSession {
  userId: string;
  tokenHash: string;
  deviceId: string;
  ip: string;
  userAgent: string | null;
  expiresAt: Date;
}

export interface SessionRepositoryPort {
  save(session: RefreshSession): Promise<void>;
}

export const SessionRepositoryPortToken = 'SessionRepositoryPort';
