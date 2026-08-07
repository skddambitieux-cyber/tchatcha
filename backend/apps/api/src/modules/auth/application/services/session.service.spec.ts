/**
 * Tests unitaires SessionService — docs/29-tests-auth.md §2.4 (G4).
 * Logout idempotent (bug.md) : refresh absent/révoqué → 204 silencieux ;
 * refresh d'un autre user → 401 ; événement uniquement si vraie révocation.
 */
import { Test } from '@nestjs/testing';
import { SessionNotFoundError } from '../../domain/errors/auth-errors';
import {
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';
import {
  SessionRepositoryPort,
  SessionRepositoryPortToken,
  StoredRefreshSession,
} from '../ports/session-repository.port';
import { SessionService } from './session.service';

function stored(overrides: Partial<StoredRefreshSession> = {}): StoredRefreshSession {
  return {
    id: 's1',
    userId: 'user-1',
    tokenHash: 'hash',
    deviceId: 'dev-abc',
    ip: '127.0.0.1',
    userAgent: null,
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    revokedAt: null,
    replacedById: null,
    ...overrides,
  };
}

describe('SessionService — docs 29 §2.4', () => {
  let service: SessionService;
  let sessions: {
    findByTokenHash: jest.Mock;
    revokeByTokenHash: jest.Mock;
    revokeAllForUser: jest.Mock;
    listActive: jest.Mock;
    save: jest.Mock;
    markRotated: jest.Mock;
  };
  let eventPublisher: { publish: jest.Mock };

  beforeEach(async () => {
    sessions = {
      findByTokenHash: jest.fn(),
      revokeByTokenHash: jest.fn().mockResolvedValue(true),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
      listActive: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue('s2'),
      markRotated: jest.fn().mockResolvedValue(undefined),
    };
    eventPublisher = { publish: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: SessionRepositoryPortToken, useValue: sessions },
        { provide: EventPublisherPortToken, useValue: eventPublisher },
      ],
    }).compile();

    service = moduleRef.get(SessionService);
  });

  it('revoke refresh actif du user → revoked + événement logout', async () => {
    sessions.findByTokenHash.mockResolvedValue(stored());
    await service.revoke('user-1', 'rt');
    expect(sessions.revokeByTokenHash).toHaveBeenCalledWith('hash');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'auth.session.revoked',
        payload: expect.objectContaining({ reason: 'logout' }),
      }),
    );
  });

  it('revoke refresh inconnu → 204 silencieux, AUCUN événement', async () => {
    sessions.findByTokenHash.mockResolvedValue(null);
    await service.revoke('user-1', 'rt');
    expect(sessions.revokeByTokenHash).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('revoke refresh déjà révoqué → 204 silencieux (idempotent)', async () => {
    sessions.findByTokenHash.mockResolvedValue(stored({ revokedAt: new Date() }));
    await service.revoke('user-1', 'rt');
    expect(sessions.revokeByTokenHash).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('revoke refresh d’un AUTRE user → SessionNotFound (401)', async () => {
    sessions.findByTokenHash.mockResolvedValue(stored({ userId: 'user-2' }));
    await expect(service.revoke('user-1', 'rt')).rejects.toThrow(
      SessionNotFoundError,
    );
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('revokeAll → toutes les sessions révoquées + événements logout_all', async () => {
    sessions.listActive.mockResolvedValue([
      {
        id: 's1',
        device_id: 'dev-abc',
        ip: '127.0.0.1',
        user_agent: null,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 1000),
      },
    ]);
    await service.revokeAll('user-1');
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'auth.session.revoked',
        payload: expect.objectContaining({ reason: 'logout_all' }),
      }),
    );
  });

  it('revokeAll sans session active → pas de revoke, pas d’événement', async () => {
    sessions.listActive.mockResolvedValue([]);
    await service.revokeAll('user-1');
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});