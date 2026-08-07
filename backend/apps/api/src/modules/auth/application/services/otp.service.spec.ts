/**
 * Tests unitaires OtpService.request — docs/29-tests-auth.md §2.1.
 * NAZE : faux store in-memory (D-STORE-1), fake clock, port de send espionné.
 */
import { Test } from '@nestjs/testing';
import { UserStatus } from '../../domain/entities/user.entity';
import {
  OtpCooldownError,
  PhoneAlreadyRegisteredError,
  PhoneInvalidError,
  PhoneLockedError,
  SmsUnavailableError,
} from '../../domain/errors/auth-errors';
import {
  OTP_COOLDOWN_SECONDS,
  OtpSendState,
  OtpStorePort,
  OtpStorePortToken,
} from '../ports/otp-store.port';
import { OtpSenderPort, OtpSenderPortToken } from '../ports/otp-sender.port';
import { ClockPort, ClockPortToken } from '../ports/clock.port';
import {
  UserRepositoryPort,
  UserRepositoryPortToken,
} from '../ports/user-repository.port';
import {
  OtpAuditRepositoryPort,
  OtpAuditRepositoryPortToken,
} from '../ports/otp-audit-repository.port';
import { generateOtpCode, OtpService } from './otp.service';
import { OtpPurpose } from '../../domain/entities/otp-code.entity';

/** Faux store conforme au contrat OtpStorePort (Redis simulé pour les unitaires). */
class FakeOtpStore implements OtpStorePort {
  private otps = new Map<string, unknown>();
  private states = new Map<string, OtpSendState>();

  private key(phone: string, purpose: OtpPurpose): string {
    return `${phone}::${purpose}`;
  }

  setState(phone: string, state: Partial<OtpSendState>): void {
    this.states.set(phone, { lastSentAt: null, sendAt: [], lockedUntil: null, ...state });
  }

  async saveOtp(otp: Parameters<OtpStorePort['saveOtp']>[0]): Promise<void> {
    this.otps.set(this.key(otp.phone, otp.purpose), otp);
  }
  async findOtp(): Promise<null> {
    return null;
  }
  async markUsed(): Promise<void> {}
  async invalidate(): Promise<void> {}
  async incrementAttempts(): Promise<number> {
    return 0;
  }
  async getSendState(phone: string): Promise<OtpSendState> {
    return this.states.get(phone) ?? {
      lastSentAt: null,
      sendAt: [],
      lockedUntil: null,
    };
  }
  async recordSend(phone: string, at: Date): Promise<void> {
    const s = await this.getSendState(phone);
    this.states.set(phone, {
      lastSentAt: at,
      sendAt: [...s.sendAt, at],
      lockedUntil: null,
    });
  }
  async lock(phone: string, until: Date): Promise<void> {
    const s = await this.getSendState(phone);
    this.states.set(phone, { ...s, lockedUntil: until });
  }
}

class FakeClock implements ClockPort {
  private current: Date;
  constructor(now: Date) {
    this.current = now;
  }
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

const T0 = new Date('2026-08-07T08:00:00.000Z');
const PHONE = '0198000011';

describe('OtpService.request — docs 29 §2.1', () => {
  let service: OtpService;
  let clock: FakeClock;
  let store: FakeOtpStore;
  let send: jest.Mock;
  let users: {
    statusByPhone: Map<string, UserStatus>;
    created: string[];
  };
  let audit: jest.Mock;

  beforeEach(async () => {
    send = jest.fn();
    audit = jest.fn();
    users = { statusByPhone: new Map(), created: [] };
    clock = new FakeClock(T0);
    store = new FakeOtpStore();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: OtpStorePortToken, useValue: store },
        { provide: OtpSenderPortToken, useValue: { send } },
        { provide: ClockPortToken, useValue: clock },
        {
          provide: UserRepositoryPortToken,
          useValue: {
            findByPhone: jest.fn(async (_cc: string, phone: string) => {
              const status = users.statusByPhone.get(phone);
              return status
                ? ({ id: 'u1', status } as unknown as UserRepositoryPort)
                : null;
            }),
            createPending: jest.fn(async (_cc: string, phone: string) => {
              users.created.push(phone);
              users.statusByPhone.set(phone, UserStatus.PENDING_OTP);
              return { id: 'u1' };
            }),
            markOtpVerified: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: OtpAuditRepositoryPortToken,
          useValue: { record: audit },
        },
      ],
    }).compile();

    service = moduleRef.get(OtpService);
  });

  it('envoi OK → OTP émis : expires_at=now+300s, send ×1, audit avec hash SHA-256', async () => {
    send.mockResolvedValue(undefined);
    const res = await service.request({
      countryCode: 'BJ',
      phone: PHONE,
      purpose: OtpPurpose.REGISTER,
    });
    expect(res.expiresAt.getTime() - T0.getTime()).toBe(300_000);
    expect(res.retryAfterSeconds).toBe(OTP_COOLDOWN_SECONDS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0].codeHash).toMatch(/^[0-9a-f]{64}$/u);
    // Le SMS reçoit un code en clair (message), jamais dans la réponse.
    const msg = send.mock.calls[0][0];
    expect(msg.code).toMatch(/^\d{6}$/u);
  });

  it('téléphone invalide → PhoneInvalid', async () => {
    await expect(
      service.request({ countryCode: 'BJ', phone: 'abc', purpose: OtpPurpose.REGISTER }),
    ).rejects.toThrow(PhoneInvalidError);
  });

  it('cooldown 45s non écoulé → OtpCooldown', async () => {
    store.setState(PHONE, { lastSentAt: new Date(T0.getTime() - 10_000) });
    await expect(
      service.request({ countryCode: 'BJ', phone: PHONE, purpose: OtpPurpose.LOGIN }),
    ).rejects.toThrow(OtpCooldownError);
  });

  it('fenêtre : 5 envois dans les 15 min → PhoneLocked (D1)', async () => {
    store.setState(PHONE, {
      lastSentAt: new Date(T0.getTime() - 60_000),
      sendAt: [0, 1, 2, 3, 4].map((i) => new Date(T0.getTime() - (i + 1) * 60_000)),
    });
    await expect(
      service.request({ countryCode: 'BJ', phone: PHONE, purpose: OtpPurpose.REGISTER }),
    ).rejects.toThrow(PhoneLockedError);
  });

  it('REGISTER + compte déjà ACTIVE → PhoneAlreadyRegistered', async () => {
    users.statusByPhone.set(PHONE, UserStatus.ACTIVE);
    await expect(
      service.request({ countryCode: 'BJ', phone: PHONE, purpose: OtpPurpose.REGISTER }),
    ).rejects.toThrow(PhoneAlreadyRegisteredError);
  });

  it('D3 : REGISTER sans compte → PENDING_OTP créé une seule fois (2ᵉ request OK)', async () => {
    send.mockResolvedValue(undefined);
    await service.request({ countryCode: 'BJ', phone: PHONE, purpose: OtpPurpose.REGISTER });
    clock.advance(46_000);
    await service.request({ countryCode: 'BJ', phone: PHONE, purpose: OtpPurpose.REGISTER });
    expect(users.created).toEqual([PHONE]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('LOGIN inconnu → envoi autorisé sans création (pas de fuite d\'existence)', async () => {
    send.mockResolvedValue(undefined);
    await service.request({ countryCode: 'BJ', phone: PHONE, purpose: OtpPurpose.LOGIN });
    expect(users.created).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('échec send ×3 tentatives → SmsUnavailable', async () => {
    send.mockRejectedValue(new Error('provider down'));
    await expect(
      service.request({ countryCode: 'BJ', phone: PHONE, purpose: OtpPurpose.LOGIN }),
    ).rejects.toThrow(SmsUnavailableError);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('send OK au 2ᵉ retry → succès (send appelé 2×)', async () => {
    send.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(undefined);
    await expect(
      service.request({ countryCode: 'BJ', phone: PHONE, purpose: OtpPurpose.LOGIN }),
    ).resolves.toBeDefined();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('génération : 6 chiffres, deux générations ≠', () => {
    const a = generateOtpCode();
    const b = generateOtpCode();
    expect(a).toMatch(/^\d{6}$/u);
    expect(a).not.toBe(b);
  });
});