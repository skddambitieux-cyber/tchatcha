/**
 * Tests unitaires TokenService — docs/29-tests-auth.md §2.3 (refresh).
 * Faux SessionRepositoryPort + UserRepositoryPort + Clock.
 */
import { Test } from '@nestjs/testing';
import { UserRole } from '../../domain/entities/user-role';
import { UserStatus } from '../../domain/entities/user.entity';
import {
  AccountLockedError,
  DeviceMismatchError,
  RefreshExpiredError,
  RefreshReusedError,
  RefreshUnknownError,
} from '../../domain/errors/auth-errors';
import {
  ClockPort,
  ClockPortToken,
} from '../ports/clock.port';
import {
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';
import {
  SessionRepositoryPort,
  SessionRepositoryPortToken,
  StoredRefreshSession,
} from '../ports/session-repository.port';
import { TokenManagerPort, TokenManagerPortToken } from '../ports/token-manager.port';
import {
  UserRepositoryPort,
  UserRepositoryPortToken,
} from '../ports/user-repository.port';
import { TokenService } from './token.service';

const NOW = new Date('2026-08-07T10:00:00.000Z');

function storedSession(overrides: Partial<StoredRefreshSession> = {}): StoredRefreshSession {
  return {
    id: 's1',
    userId: 'user-1',
    tokenHash: 'hash',
    deviceId: 'dev-abc',
    ip: '127.0.0.1',
    userAgent: null,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 3600 * 1000),
    revokedAt: null,
    replacedById: null,
    ...overrides,
  };
}

const device = { session_id: 'dev-abc', ip: '127.0.0.1' };

describe('TokenService.rotate — docs 29 §2.3', () => {
  let service: TokenService;
  let sessions: {
    save: jest.Mock;
    findByTokenHash: jest.Mock;
    markRotated: jest.Mock;
    revokeAllForUser: jest.Mock;
    revokeByTokenHash: jest.Mock;
  };
  let signAccess: jest.Mock;
  let eventPublisher: { publish: jest.Mock };
  let findById: jest.Mock;
  let findRole: jest.Mock;

  beforeEach(async () => {
    sessions = {
      save: jest.fn().mockResolvedValue('s2'),
      findByTokenHash: jest.fn(),
      markRotated: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
      revokeByTokenHash: jest.fn().mockResolvedValue(true),
    };
    signAccess = jest.fn().mockReturnValue('jwt');
    eventPublisher = { publish: jest.fn() };
    findById = jest.fn();
    findRole = jest.fn().mockResolvedValue(UserRole.CLIENT);

    const fakeClock: ClockPort = { now: () => NOW };
    const fakeUsers: UserRepositoryPort = {
      findByPhone: jest.fn(),
      findById,
      findRole,
      createPending: jest.fn(),
      markOtpVerified: jest.fn(),
      updateStatus: jest.fn(),
      activateRegistration: jest.fn(),
    };
    const fakeTokens: TokenManagerPort = {
      signAccess,
      verifyAccess: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: SessionRepositoryPortToken, useValue: sessions },
        { provide: TokenManagerPortToken, useValue: fakeTokens },
        { provide: ClockPortToken, useValue: fakeClock },
        { provide: UserRepositoryPortToken, useValue: fakeUsers },
        { provide: EventPublisherPortToken, useValue: eventPublisher },
      ],
    }).compile();

    service = moduleRef.get(TokenService);

    sessions.findByTokenHash.mockResolvedValue(storedSession());
    findById.mockResolvedValue({
      id: 'user-1',
      country_code: 'BJ',
      phone: '0198000011',
      full_name: 'Aïcha Sossou',
      status: UserStatus.ACTIVE,
    });
  });

  it('refresh valide → nouveaux tokens, ancien marqué replaced_by', async () => {
    const result = await service.rotate({ refreshToken: 'rt', device });
    expect(result.access_token).toBe('jwt');
    expect(result.refresh_token.length).toBeGreaterThanOrEqual(43); // ≥ 32 octets base64url
    expect(sessions.markRotated).toHaveBeenCalledWith('s1', 's2');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth.session.rotated' }),
    );
  });

  it('token inconnu → RefreshUnknown (unauthorized)', async () => {
    sessions.findByTokenHash.mockResolvedValue(null);
    await expect(service.rotate({ refreshToken: 'x', device })).rejects.toThrow(
      RefreshUnknownError,
    );
  });

  it('token déjà révoqué → RefreshReused + famille révoquée', async () => {
    sessions.findByTokenHash.mockResolvedValue(
      storedSession({ revokedAt: new Date() }),
    );
    await expect(service.rotate({ refreshToken: 'rt', device })).rejects.toThrow(
      RefreshReusedError,
    );
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth.session.revoked', payload: expect.objectContaining({ reason: 'reuse_detected' }) }),
    );
  });

  it('token déjà remplacé (rejeu) → RefreshReused + famille révoquée', async () => {
    sessions.findByTokenHash.mockResolvedValue(
      storedSession({ replacedById: 's3' }),
    );
    await expect(service.rotate({ refreshToken: 'rt', device })).rejects.toThrow(
      RefreshReusedError,
    );
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('token expiré (> 30 j) → RefreshExpired', async () => {
    sessions.findByTokenHash.mockResolvedValue(
      storedSession({ expiresAt: new Date(NOW.getTime() - 1000) }),
    );
    await expect(service.rotate({ refreshToken: 'rt', device })).rejects.toThrow(
      RefreshExpiredError,
    );
  });

  it('device_id ≠ session → DeviceMismatch (invalid_device)', async () => {
    await expect(
      service.rotate({ refreshToken: 'rt', device: { session_id: 'other' } }),
    ).rejects.toThrow(DeviceMismatchError);
  });

  it('compte non ACTIVE → AccountLocked', async () => {
    findById.mockResolvedValue({
      id: 'user-1',
      country_code: 'BJ',
      phone: '0198000011',
      full_name: 'Aïcha',
      status: UserStatus.SUSPENDED,
    });
    await expect(service.rotate({ refreshToken: 'rt', device })).rejects.toThrow(
      AccountLockedError,
    );
  });
});