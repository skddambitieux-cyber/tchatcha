/**
 * Tests unitaires LoginService — docs/29-tests-auth.md §2.3 (G2).
 * Faux UserRepositoryPort + OtpService espionné + TokenService mock.
 */
import { Test } from '@nestjs/testing';
import { UserRole } from '../../domain/entities/user-role';
import { UserStatus } from '../../domain/entities/user.entity';
import {
  AccountLockedError,
  NoPendingOtpError,
} from '../../domain/errors/auth-errors';
import {
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';
import {
  UserRepositoryPort,
  UserRepositoryPortToken,
} from '../ports/user-repository.port';
import { LoginService } from './login.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

const input = {
  countryCode: 'BJ',
  phone: '0198000011',
  code: '483920',
  device: { session_id: 'dev-abc', ip: '127.0.0.1' },
};

const userPublic = {
  id: 'user-1',
  role: UserRole.CLIENT,
  full_name: 'Aïcha Sossou',
  phone: '0198000011',
  status: UserStatus.ACTIVE,
};

describe('LoginService — docs 29 §2.3', () => {
  let service: LoginService;
  let verify: jest.Mock;
  let issuePair: jest.Mock;
  let eventPublisher: { publish: jest.Mock };
  let findById: jest.Mock;
  let findRole: jest.Mock;

  beforeEach(async () => {
    verify = jest.fn();
    issuePair = jest.fn().mockResolvedValue({
      access_token: 'at',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: 'rt',
    });
    eventPublisher = { publish: jest.fn() };
    findById = jest.fn();
    findRole = jest.fn().mockResolvedValue(UserRole.CLIENT);

    const fakeUsers: UserRepositoryPort = {
      findByPhone: jest.fn(),
      findById,
      findRole,
      createPending: jest.fn(),
      markOtpVerified: jest.fn(),
      updateStatus: jest.fn(),
      activateRegistration: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoginService,
        { provide: OtpService, useValue: { verify } },
        { provide: UserRepositoryPortToken, useValue: fakeUsers },
        { provide: TokenService, useValue: { issuePair } },
        { provide: EventPublisherPortToken, useValue: eventPublisher },
      ],
    }).compile();

    service = moduleRef.get(LoginService);

    verify.mockResolvedValue({ status: 'otp_verified', userId: 'user-1' });
    findById.mockResolvedValue({
      id: 'user-1',
      country_code: 'BJ',
      phone: '0198000011',
      full_name: 'Aïcha Sossou',
      status: UserStatus.ACTIVE,
      otp_verified_at: new Date(),
    });
  });

  it('compte ACTIVE + code OK → tokens + user (G2-OTP-LOGIN)', async () => {
    const result = await service.login(input);
    expect(result.user.status).toBe(UserStatus.ACTIVE);
    expect(result.user.role).toBe(UserRole.CLIENT);
    expect(result.tokens.access_token).toBe('at');
    expect(verify).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth.user.logged_in' }),
    );
  });

  it('verify sans userId (compte inconnu) → NoPendingOtp (pas de fuite)', async () => {
    verify.mockResolvedValue({ status: 'otp_verified', userId: undefined });
    await expect(service.login(input)).rejects.toThrow(NoPendingOtpError);
  });

  it('user introuvable → NoPendingOtp', async () => {
    findById.mockResolvedValue(null);
    await expect(service.login(input)).rejects.toThrow(NoPendingOtpError);
  });

  it('compte SUSPENDED → 403 account_locked', async () => {
    findById.mockResolvedValue({
      id: 'user-1',
      country_code: 'BJ',
      phone: '0198000011',
      full_name: 'Aïcha',
      status: UserStatus.SUSPENDED,
    });
    await expect(service.login(input)).rejects.toThrow(AccountLockedError);
  });

  it('compte BANNED → 403 account_locked', async () => {
    findById.mockResolvedValue({
      id: 'user-1',
      country_code: 'BJ',
      phone: '0198000011',
      full_name: 'Aïcha',
      status: UserStatus.BANNED,
    });
    await expect(service.login(input)).rejects.toThrow(AccountLockedError);
  });

  it('sans rôle en base → UserPublic.role = CLIENT (défaut)', async () => {
    findRole.mockResolvedValue(null);
    const result = await service.login(input);
    expect(result.user.role).toBe(UserRole.CLIENT);
  });
});