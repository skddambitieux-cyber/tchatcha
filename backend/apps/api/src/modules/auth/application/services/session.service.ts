/**
 * TCHATCHA — SessionService (sous-lot 6, 28 §5, 27 §7–§8).
 * Logout idempotent (204 si session absente/révoquée), mais 401 si le refresh
 * appartient à un autre utilisateur (augmente). Événement auth.session.revoked
 * émis UNIQUEMENT quand une vraie session est révoquée (bug.md).
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ActiveSession,
  SessionRepositoryPort,
  SessionRepositoryPortToken,
} from '../ports/session-repository.port';
import {
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';
import { SessionNotFoundError } from '../../domain/errors/auth-errors';

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(SessionRepositoryPortToken)
    private readonly sessions: SessionRepositoryPort,
    @Inject(EventPublisherPortToken)
    private readonly events: EventPublisherPort,
  ) {}

  /**
   * Révoque une session (logout ciblé). Idempotent : refresh absent ou déjà
   * révoqué → 204 silencieux. Refresh appartenant à un autre user → 401.
   */
  async revoke(userId: string, refreshToken: string): Promise<void> {
    const session = await this.sessions.findByTokenHash(hashToken(refreshToken));
    if (!session) {
      return; // idempotent : session inexistante → 204 silencieux
    }
    if (session.userId !== userId) {
      throw new SessionNotFoundError(); // refresh d'un autre user → 401
    }
    if (session.revokedAt) {
      return; // déjà révoquée → 204 silencieux (pas d'événement)
    }
    await this.sessions.revokeByTokenHash(session.tokenHash);
    this.events.publish({
      type: 'auth.session.revoked',
      payload: {
        user_id: userId,
        device_id: session.deviceId,
        reason: 'logout',
        ts: new Date().toISOString(),
      },
    });
  }

  /** Révoque toutes les sessions de l'utilisateur (logout-all). */
  async revokeAll(userId: string): Promise<void> {
    const active = await this.sessions.listActive(userId);
    await this.sessions.revokeAllForUser(userId);
    for (const session of active) {
      this.events.publish({
        type: 'auth.session.revoked',
        payload: {
          user_id: userId,
          device_id: session.device_id,
          reason: 'logout_all',
          ts: new Date().toISOString(),
        },
      });
    }
  }

  /** Sessions actives (optionnel MVP — 28 §5). */
  listActive(userId: string): Promise<ActiveSession[]> {
    return this.sessions.listActive(userId);
  }
}