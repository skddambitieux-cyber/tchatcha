/**
 * Tests unitaires OtpService — docs/29-tests-auth.md §2.1 (request) et §2.2 (verify).
 * Faux store in-memory (D-STORE-1), fake clock, port de send espionné.
 */
import { Test } from '@nestjs/testing';
import { UserStatus } from '../../domain/entities/user.entity';
import {
  NoPendingOtpError,
  OtpAlreadyUsedError,
  OtpCooldownError,
  OtpExhaustedError,
  OtpExpiredError,
  OtpInvalidError,
  PhoneAlreadyRegisteredError,
  PhoneInvalidError,
  PhoneLockedError,
  SmsUnavailableError,
} from '../../domain/errors/auth-errors';
import {
  OTP_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS,
  OtpSendState,
  OtpStorePort,
  OtpStorePortToken,
  PendingOtp,
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
import {
  generateOtpCode,
  hashOtpCode,
  OtpService,
} from './otp.service';
import { OtpPurpose } from '../../domain/entities/otp-code.entity';

/** Faux store conforme au contrat OtpStorePort (Redis simulé pour les unitaires). */
class FakeOtpStore implements OtpStorePort {
  private otps = new Map<string, PendingOtp>();
  private states = new Map<string, OtpSendState>();

  private key(phone: string, purpose: OtpPurpose): string {
    return `${phone}::${purpose}`;
  }

  setState(phone: string, state: Partial<OtpSendState>): void {
    this.states.set(phone, { lastSentAt: null, sendAt: [], lockedUntil: null, ...state });
  }

  /** Se positionne un OTP (utile pour tester verify sans passer par request). */
  async seedOtp(
    phone: string,
    purpose: OtpPurpose,
    overrides: Partial<PendingOtp> = {},
  ): Promise<void> {
    await this.saveOtp({
      phone,
      purpose,
      codeHash: hashOtpCode('123456'),
      expiresAt: new Date(Date.now() + 300_000),
      attempts: 0,
      usedAt: null,
      ...overrides,
    });
  }

  async saveOtp(otp: PendingOtp): Promise<void> {
    this.otps.set(this.key(otp.phone, otp.purpose), { ...otp });
  }
  async findOtp(phone: string, purpose: OtpPurpose): Promise<PendingOtp | null> {
    const otp = this.otps.get(this.key(phone, purpose));
    return otp ? { ...otp } : null;
  }
  async consume(phone: string, purpose: OtpPurpose, usedAt: Date): Promise<boolean> {
    const k = this.key(phone, purpose);
    const otp = this.otps.get(k);
    if (!otp) return false;
    if (otp.usedAt) return false;
    this.otps.set(k, { ...otp, usedAt });
    return true;
  }
  async invalidate(phone: string, purpose: OtpPurpose): Promise<void> {
    this.otps.delete(this.key(phone, purpose));
  }
  async incrementAttempts(phone: string, purpose: OtpPurpose): Promise<number> {
    const k = this.key(phone, purpose);
    const otp = this.otps.get(k);
    if (!otp) return 1;
    const attempts = otp.attempts + 1;
    this.otps.set(k, { ...otp, attempts });
    return attempts;
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
const CODE = '123456';

describe('OtpService — docs 29 §2.1/§2.2', () => {
  let service: OtpService;
  let clock: FakeClock;
  let store: FakeOtpStore;
  let send: jest.Mock;
  let markOtpVerified: jest.Mock;
  let users: { statusByPhone: Map<string, UserStatus>; created: string[] };
  let audit: { record: jest.Mock; updateAttempts: jest.Mock; markUsed: jest.Mock };

  beforeEach(async () => {
    send = jest.fn();
    markOtpVerified = jest.fn();
    audit = {
      record: jest.fn(),
      updateAttempts: jest.fn(),
      markUsed: jest.fn(),
    };
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
                ? { id: 'u1', status }
                : null;
            }),
            createPending: jest.fn(async (_cc: string, phone: string) => {
              users.created.push(phone);
              users.statusByPhone.set(phone, UserStatus.PENDING_OTP);
              return { id: 'u1' };
            }),
            markOtpVerified,
            updateStatus: jest.fn(),
          },
        },
        { provide: OtpAuditRepositoryPortToken, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(OtpService);
  });

  describe('request — §2.1', () => {
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
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record.mock.calls[0][0].codeHash).toMatch(/^[0-9a-f]{64}$/u);
      expect(send.mock.calls[0][0].code).toMatch(/^\d{6}$/u);
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

  describe('verify — §2.2', () => {
    it('code exact, attempts 0 → OtpVerified, used_at posé, audit', async () => {
      users.statusByPhone.set(PHONE, UserStatus.PENDING_OTP);
      await store.seedOtp(PHONE, OtpPurpose.REGISTER);
      const res = await service.verify({
        countryCode: 'BJ',
        phone: PHONE,
        code: CODE,
        purpose: OtpPurpose.REGISTER,
      });
      expect(res.status).toBe('otp_verified');
      expect(res.userId).toBeUndefined();
      expect(audit.markUsed).toHaveBeenCalledTimes(1);
      expect(markOtpVerified).toHaveBeenCalledWith('u1');
      // usage unique : un 2ᵉ verify échoue
      await expect(
        service.verify({ countryCode: 'BJ', phone: PHONE, code: CODE, purpose: OtpPurpose.REGISTER }),
      ).rejects.toThrow(OtpAlreadyUsedError);
    });

    it('code exact après 1 échec (attempts=1) → succès au 2ᵉ essai', async () => {
      users.statusByPhone.set(PHONE, UserStatus.ACTIVE);
      await store.seedOtp(PHONE, OtpPurpose.LOGIN, { attempts: 1 });
      const res = await service.verify({
        countryCode: 'BJ',
        phone: PHONE,
        code: CODE,
        purpose: OtpPurpose.LOGIN,
      });
      expect(res.status).toBe('otp_verified');
      expect(res.userId).toBe('u1');
    });

    it('code faux, attempts 0 → OtpInvalid + attempts_left=2', async () => {
      await store.seedOtp(PHONE, OtpPurpose.LOGIN);
      const err = await service.verify({
        countryCode: 'BJ',
        phone: PHONE,
        code: '000001',
        purpose: OtpPurpose.LOGIN,
      }).then(() => null, (e) => e);
      expect(err).toBeInstanceOf(OtpInvalidError);
      expect(err.attemptsLeft).toBe(OTP_MAX_ATTEMPTS - 1);
      expect(audit.updateAttempts).toHaveBeenCalledWith(PHONE, OtpPurpose.LOGIN, 1);
    });

    it('code faux, attempts 1 → OtpInvalid + attempts_left=1', async () => {
      await store.seedOtp(PHONE, OtpPurpose.LOGIN, { attempts: 1 });
      const err = await service.verify({
        countryCode: 'BJ',
        phone: PHONE,
        code: '000001',
        purpose: OtpPurpose.LOGIN,
      }).then(() => null, (e) => e);
      expect(err).toBeInstanceOf(OtpInvalidError);
      expect(err.attemptsLeft).toBe(1);
    });

    it('code faux, attempts 2 → OtpExhausted (3ᵉ échec, code invalidé)', async () => {
      await store.seedOtp(PHONE, OtpPurpose.LOGIN, { attempts: 2 });
      await expect(
        service.verify({ countryCode: 'BJ', phone: PHONE, code: '000001', purpose: OtpPurpose.LOGIN }),
      ).rejects.toThrow(OtpExhaustedError);
      // code invalidé
      await expect(
        service.verify({ countryCode: 'BJ', phone: PHONE, code: CODE, purpose: OtpPurpose.LOGIN }),
      ).rejects.toThrow(NoPendingOtpError);
    });

    it('code juste mais used_at déjà non nul → OtpAlreadyUsed', async () => {
      await store.seedOtp(PHONE, OtpPurpose.LOGIN, { usedAt: new Date(T0.getTime() - 1000) });
      await expect(
        service.verify({ countryCode: 'BJ', phone: PHONE, code: CODE, purpose: OtpPurpose.LOGIN }),
      ).rejects.toThrow(OtpAlreadyUsedError);
    });

    it('OTP > 5 min → OtpExpired (le store retourne l\'expiré, le service l\'applique)', async () => {
      await store.seedOtp(PHONE, OtpPurpose.LOGIN, {
        expiresAt: new Date(T0.getTime() - 1_000),
      });
      await expect(
        service.verify({ countryCode: 'BJ', phone: PHONE, code: CODE, purpose: OtpPurpose.LOGIN }),
      ).rejects.toThrow(OtpExpiredError);
    });

    it('aucun OTP (store vide) → NoPendingOtp', async () => {
      users.statusByPhone.set(PHONE, UserStatus.PENDING_OTP);
      await expect(
        service.verify({ countryCode: 'BJ', phone: PHONE, code: CODE, purpose: OtpPurpose.REGISTER }),
      ).rejects.toThrow(NoPendingOtpError);
    });

    it('canal verrouillé → PhoneLocked', async () => {
      store.setState(PHONE, { lockedUntil: new Date(T0.getTime() + 60_000) });
      await expect(
        service.verify({ countryCode: 'BJ', phone: PHONE, code: CODE, purpose: OtpPurpose.LOGIN }),
      ).rejects.toThrow(PhoneLockedError);
    });

    it('vérification simultanée : 2 verify en concurrence, un seul succès', async () => {
      users.statusByPhone.set(PHONE, UserStatus.PENDING_OTP);
      await store.seedOtp(PHONE, OtpPurpose.REGISTER);
      const [r1, r2] = await Promise.allSettled([
        service.verify({ countryCode: 'BJ', phone: PHONE, code: CODE, purpose: OtpPurpose.REGISTER }),
        service.verify({ countryCode: 'BJ', phone: PHONE, code: CODE, purpose: OtpPurpose.REGISTER }),
      ]);
      expect(r1.status === 'fulfilled' ? r1.value.status : r1.reason.name).toBe('otp_verified');
      // un seul fulfilled
      const ok = [r1, r2].filter((r) => r.status === 'fulfilled');
      expect(ok).toHaveLength(1);
      const ko = [r1, r2].find((r) => r.status === 'rejected');
      expect((ko as PromiseRejectedResult).reason).toBeInstanceOf(OtpAlreadyUsedError);
    });

    it('purpose=REGISTER → userId absent (pas de délivrance)', async () => {
      users.statusByPhone.set(PHONE, UserStatus.PENDING_OTP);
      await store.seedOtp(PHONE, OtpPurpose.REGISTER);
      const res = await service.verify({
        countryCode: 'BJ',
        phone: PHONE,
        code: CODE,
        purpose: OtpPurpose.REGISTER,
      });
      expect(res.userId).toBeUndefined();
      expect(res.status).toBe('otp_verified');
    });
  });
});