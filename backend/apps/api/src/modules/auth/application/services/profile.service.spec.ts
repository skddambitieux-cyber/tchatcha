/**
 * Tests unitaires ProfileService.completeRegistration — docs/29-tests-auth.md §2.5.
 * Faux UserRepositoryPort + TokenService espionné + EventPublisher mock.
 */
import { Test } from '@nestjs/testing';
import { UserRole } from '../../domain/entities/user-role';
import { UserStatus } from '../../domain/entities/user.entity';
import {
  AccountAnonymizedError,
  AccountLockedError,
  CategoryRequiredError,
  ConsentRequiredError,
  LocalityRequiredError,
  NoPendingOtpError,
  OtpNotVerifiedError,
  PhoneAlreadyActiveError,
  UserNotFoundError,
  ZoneRequiredError,
} from '../../domain/errors/auth-errors';
import {
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';
import {
  ActivateCommand,
  UserRepositoryPort,
  UserRepositoryPortToken,
} from '../ports/user-repository.port';
import {
  ProfessionalProfileReadPort,
  ProfessionalProfileReadPortToken,
} from '../ports/professional-profile-read.port';
import { ProfileService } from './profile.service';
import { TokenService } from './token.service';

interface FakeUser {
  id: string;
  country_code: string;
  phone: string;
  full_name: string;
  status: UserStatus;
  otp_verified_at: Date | null;
}

function makeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: 'user-1',
    country_code: 'BJ',
    phone: '0198000011',
    full_name: 'OLD',
    status: UserStatus.PENDING_OTP,
    otp_verified_at: new Date('2026-08-07T08:05:00.000Z'),
    ...overrides,
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    countryCode: 'BJ',
    phone: '0198000011',
    fullName: 'Aïcha Sossou',
    role: UserRole.CLIENT,
    consents: { cgv: true, privacy: false },
    device: { session_id: 'dev-abc', ip: '127.0.0.1' },
    ...overrides,
  };
}

describe('ProfileService.completeRegistration — docs 29 §2.5', () => {
  let service: ProfileService;
  let activate: jest.Mock;
  let findByPhone: jest.Mock;
  let eventPublisher: { publish: jest.Mock };
  let issuePair: jest.Mock;
  let user: FakeUser;

  beforeEach(async () => {
    user = makeUser();
    activate = jest.fn();
    findByPhone = jest.fn();
    eventPublisher = { publish: jest.fn() };
    issuePair = jest.fn().mockResolvedValue({
      access_token: 'at',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: 'rt',
    });

    const fakeUsers: UserRepositoryPort = {
      findByPhone,
      findById: jest.fn(),
      findRole: jest.fn(),
      findRolesById: jest.fn().mockResolvedValue([]),
      createPending: jest.fn(),
      markOtpVerified: jest.fn(),
      updateStatus: jest.fn(),
      activateRegistration: (userId: string, input: ActivateCommand) =>
        activate(userId, input),
    };
    findByPhone.mockImplementation(async () => user);

    const fakeProPort: ProfessionalProfileReadPort = {
      findByUserId: jest.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: UserRepositoryPortToken, useValue: fakeUsers },
        { provide: ProfessionalProfileReadPortToken, useValue: fakeProPort },
        { provide: TokenService, useValue: { issuePair } },
        { provide: EventPublisherPortToken, useValue: eventPublisher },
      ],
    }).compile();

    service = moduleRef.get(ProfileService);
    activate.mockImplementation(async (_id: string, input: ActivateCommand) => ({
      ...user,
      status: UserStatus.ACTIVE,
      full_name: input.fullName,
    }));
  });

  it('CLIENT + cgv → ACTIVE, événement registered, tokens émis', async () => {
    const result = await service.completeRegistration(makeInput());
    expect(result.user.status).toBe(UserStatus.ACTIVE);
    expect(result.user.role).toBe(UserRole.CLIENT);
    expect(result.tokens.access_token).toBe('at');
    expect(issuePair).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth.user.registered' }),
    );
  });

  it('PENDING_OTP sans OTP vérifié → OtpNotVerified', async () => {
    user = makeUser({ otp_verified_at: null });
    await expect(
      service.completeRegistration(makeInput()),
    ).rejects.toThrow(OtpNotVerifiedError);
  });

  it('compte inconnu → NoPendingOtp (pas de fuite)', async () => {
    user = null as never;
    await expect(
      service.completeRegistration(makeInput()),
    ).rejects.toThrow(NoPendingOtpError);
  });

  it('sans consent.cgv → ConsentRequired', async () => {
    await expect(
      service.completeRegistration(
        makeInput({ consents: { cgv: false } }),
      ),
    ).rejects.toThrow(ConsentRequiredError);
  });

  it('PRO sans category_id → CategoryRequired', async () => {
    await expect(
      service.completeRegistration(makeInput({ role: UserRole.PROFESSIONAL })),
    ).rejects.toThrow(CategoryRequiredError);
  });

  it('PRO sans locality_id → LocalityRequired', async () => {
    await expect(
      service.completeRegistration(
        makeInput({ role: UserRole.PROFESSIONAL, categoryId: 'cat-1' }),
      ),
    ).rejects.toThrow(LocalityRequiredError);
  });

  it('DELIVERER sans delivery_zone → ZoneRequired', async () => {
    await expect(
      service.completeRegistration(makeInput({ role: UserRole.DELIVERER })),
    ).rejects.toThrow(ZoneRequiredError);
  });

  it('PRO complet → activation avec extras pro', async () => {
    const result = await service.completeRegistration(
      makeInput({
        role: UserRole.PROFESSIONAL,
        categoryId: 'cat-1',
        localityId: 'loc-1',
        divisionId: 'div-1',
      }),
    );
    expect(result.user.role).toBe(UserRole.PROFESSIONAL);
    expect(activate).toHaveBeenCalledTimes(1);
    const command: ActivateCommand = activate.mock.calls[0][1];
    expect(command.pro?.categoryId).toBe('cat-1');
    expect(command.pro?.localityId).toBe('loc-1');
  });

  it('course : compte déjà ACTIVE → PhoneAlreadyActive', async () => {
    user = makeUser({ status: UserStatus.ACTIVE });
    await expect(
      service.completeRegistration(makeInput()),
    ).rejects.toThrow(PhoneAlreadyActiveError);
  });
});

describe('ProfileService.getMe — docs 33 §2 (lot 6.3.1)', () => {
  let service: ProfileService;
  let findByPhone: jest.Mock;
  let findRolesById: jest.Mock;
  let findByUserId: jest.Mock;
  let eventPublisher: { publish: jest.Mock };

  function makeMeUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-me-1',
      country_code: 'BJ',
      phone: '0198000022',
      email: 'aicha@exemple.bj',
      full_name: 'Aïcha Sossou',
      avatar_url: 'https://s3.example/avatar/a.png',
      locale: 'fr',
      status: UserStatus.ACTIVE,
      otp_verified_at: new Date('2026-08-07T08:05:00.000Z'),
      created_at: new Date('2026-08-07T08:00:00.000Z'),
      flags: {},
      anonymized_at: null,
      ...overrides,
    };
  }

  beforeEach(async () => {
    findByPhone = jest.fn();
    findRolesById = jest.fn().mockResolvedValue([]);
    findByUserId = jest.fn().mockResolvedValue(null);
    eventPublisher = { publish: jest.fn() };

    const fakeUsers: UserRepositoryPort = {
      findByPhone,
      findById: findByPhone,
      findRole: jest.fn(),
      findRolesById,
      createPending: jest.fn(),
      markOtpVerified: jest.fn(),
      updateStatus: jest.fn(),
      activateRegistration: jest.fn(),
    };
    const fakeProPort: ProfessionalProfileReadPort = { findByUserId };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: UserRepositoryPortToken, useValue: fakeUsers },
        { provide: ProfessionalProfileReadPortToken, useValue: fakeProPort },
        { provide: TokenService, useValue: { issuePair: jest.fn() } },
        { provide: EventPublisherPortToken, useValue: eventPublisher },
      ],
    }).compile();

    service = moduleRef.get(ProfileService);
  });

  it('ACTIVE CLIENT → profil complet sans sous-objet métier', async () => {
    findByPhone.mockResolvedValue(makeMeUser());
    const me = await service.getMe('user-me-1');
    expect(me).toMatchObject({
      id: 'user-me-1',
      country_code: 'BJ',
      phone: '0198000022',
      email: 'aicha@exemple.bj',
      full_name: 'Aïcha Sossou',
      status: UserStatus.ACTIVE,
      roles: [],
      professional: null,
      deliverer: null,
    });
  });

  it('ACTIVE + rôle PROFESSIONAL + profile pros existant → professional peuplé', async () => {
    findByPhone.mockResolvedValue(makeMeUser());
    findRolesById.mockResolvedValue([UserRole.PROFESSIONAL]);
    findByUserId.mockResolvedValue({
      id: 'prof-1',
      business_name: 'Plomberie SOS',
      status: 'PENDING_VERIFICATION',
      verified: false,
      verified_at: null,
      rating_avg: 4.5,
      rating_count: 12,
      trust_score: 0.78,
      completed_jobs: 34,
      location_name: 'Abomey-Calavi',
    });
    const me = await service.getMe('user-me-1');
    expect(me.professional).toMatchObject({
      id: 'prof-1',
      business_name: 'Plomberie SOS',
      status: 'PENDING_VERIFICATION',
      verification_status: 'UNVERIFIED',
      rating_avg: 4.5,
      rating_count: 12,
      trust_score: 0.78,
      completed_jobs: 34,
      location_name: 'Abomey-Calavi',
    });
  });

  it('rôle PROFESSIONAL sans profile pros → professional null (pas d’erreur)', async () => {
    findByPhone.mockResolvedValue(makeMeUser());
    findRolesById.mockResolvedValue([UserRole.PROFESSIONAL]);
    const me = await service.getMe('user-me-1');
    expect(me.professional).toBeNull();
  });

  it('rôle DELIVERER avec flags zone/moyens → deliverer {zone, means}', async () => {
    findByPhone.mockResolvedValue(
      makeMeUser({
        flags: {
          deliverer: { zone: 'Cotonou', means: 'moto' },
        },
      }),
    );
    findRolesById.mockResolvedValue([UserRole.DELIVERER]);
    const me = await service.getMe('user-me-1');
    expect(me.deliverer).toEqual({ zone: 'Cotonou', means: 'moto' });
  });

  it('rôle DELIVERER sans flags → deliverer null', async () => {
    findByPhone.mockResolvedValue(makeMeUser());
    findRolesById.mockResolvedValue([UserRole.DELIVERER]);
    const me = await service.getMe('user-me-1');
    expect(me.deliverer).toBeNull();
  });

  it('PENDING_OTP → profil restreint {id, country_code, phone, status} (E-ME-06)', async () => {
    findByPhone.mockResolvedValue(makeMeUser({ status: UserStatus.PENDING_OTP }));
    const me = await service.getMe('user-me-1');
    expect(me).toEqual({
      id: 'user-me-1',
      country_code: 'BJ',
      phone: '0198000022',
      status: UserStatus.PENDING_OTP,
    });
  });

  it('SUSPENDED → AccountLockedError', async () => {
    findByPhone.mockResolvedValue(makeMeUser({ status: UserStatus.SUSPENDED }));
    await expect(service.getMe('user-me-1')).rejects.toThrow(AccountLockedError);
  });

  it('BANNED → AccountLockedError', async () => {
    findByPhone.mockResolvedValue(makeMeUser({ status: UserStatus.BANNED }));
    await expect(service.getMe('user-me-1')).rejects.toThrow(AccountLockedError);
  });

  it('anonymized_at posé (RGPD) → AccountAnonymizedError', async () => {
    findByPhone.mockResolvedValue(
      makeMeUser({ anonymized_at: new Date('2026-08-08T00:00:00.000Z') }),
    );
    await expect(service.getMe('user-me-1')).rejects.toThrow(
      AccountAnonymizedError,
    );
  });

  it('sub inconnu → UserNotFoundError (pas de fuite)', async () => {
    findByPhone.mockResolvedValue(null);
    await expect(service.getMe('user-inconnu')).rejects.toThrow(
      UserNotFoundError,
    );
  });
});