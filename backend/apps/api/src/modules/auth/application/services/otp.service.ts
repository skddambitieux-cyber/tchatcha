/**
 * TCHATCHA — OtpService (lot 6.2). Contrat : docs/28-services-auth-contracts.md §3.
 * Règles : cooldown 45 s, max 5 envois/15 min → phone_locked 15 min (D1),
 * user PENDING_OTP créé dès la demande REGISTER (D3), TTL 5 min, usage unique.
 */
import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import {
  OTP_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_TTL_SECONDS,
  OTP_WINDOW_SECONDS,
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
import { OtpPurpose } from '../../domain/entities/otp-code.entity';
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
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';

export interface RequestOtpInput {
  countryCode: string;
  phone: string;
  purpose: OtpPurpose;
}

export interface VerifyOtpInput {
  countryCode: string;
  phone: string;
  code: string;
  purpose: OtpPurpose;
}

export interface OtpRequested {
  expiresAt: Date;
  retryAfterSeconds: number;
}

export interface OtpVerified {
  /** Présent si purpose=LOGIN (délivrance tokens), absent pour REGISTER. */
  userId?: string;
  status: 'otp_verified';
}

/** Génère un code OTP à 6 chiffres via CSPRNG (node:crypto). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Normalisation minimale : strips +/espaces/tirets (E.164 géré par le client). */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s+()-]/g, '');
}

@Injectable()
export class OtpService {
  constructor(
    @Inject(OtpStorePortToken)
    private readonly otpStore: OtpStorePort,
    @Inject(OtpSenderPortToken)
    private readonly otpSender: OtpSenderPort,
    @Inject(ClockPortToken)
    private readonly clock: ClockPort,
    @Inject(UserRepositoryPortToken)
    private readonly users: UserRepositoryPort,
    @Inject(OtpAuditRepositoryPortToken)
    private readonly otpAudit: OtpAuditRepositoryPort,
    @Inject(EventPublisherPortToken)
    private readonly events: EventPublisherPort,
  ) {}

  async request(input: RequestOtpInput): Promise<OtpRequested> {
    const phone = normalizePhone(input.phone);
    if (!/^[0-9]{8,15}$/.test(phone)) {
      throw new PhoneInvalidError();
    }
    const now = this.clock.now();

    // État du canal : verrouillage puis cooldown puis fenêtre.
    const state = await this.otpStore.getSendState(phone);
    if (state.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
      throw new PhoneLockedError(this.secondsUntil(state.lockedUntil, now));
    }
    if (
      state.lastSentAt &&
      now.getTime() - state.lastSentAt.getTime() < OTP_COOLDOWN_SECONDS * 1000
    ) {
      const retry = Math.ceil(
        (OTP_COOLDOWN_SECONDS * 1000 - (now.getTime() - state.lastSentAt.getTime())) / 1000,
      );
      throw new OtpCooldownError(retry);
    }
    if (state.sendAt.length >= OTP_MAX_SENDS_PER_WINDOW) {
      const oldest = state.sendAt[0];
      const retry = Math.ceil(
        (OTP_WINDOW_SECONDS * 1000 - (now.getTime() - oldest.getTime())) / 1000,
      );
      await this.otpStore.lock(phone, new Date(now.getTime() + OTP_WINDOW_SECONDS * 1000));
      this.events.publish({
        type: 'auth.user.locked',
        payload: { phone, reason: 'otp_send_limit', ts: now.toISOString() },
      });
      throw new PhoneLockedError(Math.max(1, retry));
    }

    // REGISTER : le numéro ne doit pas être déjà actif ; crée PENDING_OTP (D3).
    const existing = await this.users.findByPhone(input.countryCode, phone);
    if (input.purpose === OtpPurpose.REGISTER && existing?.status === UserStatus.ACTIVE) {
      throw new PhoneAlreadyRegisteredError();
    }
    if (input.purpose === OtpPurpose.REGISTER && !existing) {
      await this.users.createPending(input.countryCode, phone, input.purpose);
    }

    // Génération + envoi (2 retries internes — E-INS-05).
    const code = generateOtpCode();
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
    const codeHash = hashOtpCode(code);
    await this.otpStore.saveOtp({
      phone,
      purpose: input.purpose,
      codeHash,
      expiresAt,
      attempts: 0,
      usedAt: null,
    });
    // Trace d'audit : code_hash SHA-256 uniquement (jamais le code en clair).
    await this.otpAudit.record({
      countryCode: input.countryCode,
      phone,
      purpose: input.purpose,
      codeHash,
      expiresAt,
      attempts: 0,
      usedAt: null,
    });
    try {
      await this.sendWithRetries({
        countryCode: input.countryCode,
        phone,
        code,
        expiresInSeconds: OTP_TTL_SECONDS,
      });
    } catch {
      await this.otpStore.invalidate(phone, input.purpose);
      throw new SmsUnavailableError();
    }
    await this.otpStore.recordSend(phone, now);

    return {
      expiresAt,
      retryAfterSeconds: OTP_COOLDOWN_SECONDS,
    };
  }

  /**
   * Vérifie le code (docs 28 §3, 29 §2.2).
   * Ordre : verrouillage canal → OTP présent → déjà utilisé → expiré → code
   * (3 essais max, ck_otp_attempts) → consommation atomique (usage unique).
   */
  async verify(input: VerifyOtpInput): Promise<OtpVerified> {
    const phone = normalizePhone(input.phone);
    if (!/^[0-9]{8,15}$/.test(phone)) {
      throw new PhoneInvalidError();
    }
    const now = this.clock.now();

    // Canal verrouillé (5 envois/15 min dépassés) → même sans OTP vérifiable.
    const state = await this.otpStore.getSendState(phone);
    if (state.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
      throw new PhoneLockedError(this.secondsUntil(state.lockedUntil, now));
    }

    const otp = await this.otpStore.findOtp(phone, input.purpose);
    if (!otp) {
      throw new NoPendingOtpError();
    }
    if (otp.usedAt) {
      throw new OtpAlreadyUsedError();
    }
    if (otp.expiresAt.getTime() <= now.getTime()) {
      await this.otpStore.invalidate(phone, input.purpose);
      throw new OtpExpiredError();
    }

    const hash = hashOtpCode(input.code);
    if (hash !== otp.codeHash) {
      const attempts = await this.otpStore.incrementAttempts(
        phone,
        input.purpose,
      );
      await this.otpAudit.updateAttempts(phone, input.purpose, attempts);
      this.events.publish({
        type: 'auth.otp.attempt_failed',
        payload: {
          phone,
          purpose: input.purpose,
          attempts_left: Math.max(0, OTP_MAX_ATTEMPTS - attempts),
          ts: now.toISOString(),
        },
      });
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.otpStore.invalidate(phone, input.purpose);
        throw new OtpExhaustedError();
      }
      throw new OtpInvalidError(OTP_MAX_ATTEMPTS - attempts);
    }

    // Consommation atomique : un seul verify simultané gagne (usage unique).
    const consumed = await this.otpStore.consume(phone, input.purpose, now);
    if (!consumed) {
      throw new OtpAlreadyUsedError();
    }
    await this.otpAudit.markUsed(phone, input.purpose, now);

    const user = await this.users.findByPhone(input.countryCode, phone);
    if (user) {
      await this.users.markOtpVerified(user.id);
    }

    if (input.purpose === OtpPurpose.LOGIN) {
      return { userId: user?.id, status: 'otp_verified' };
    }
    return { status: 'otp_verified' };
  }

  /** Envoi avec 2 retries internes (3 tentatives au total). */
  async sendWithRetries(message: {
    countryCode: string;
    phone: string;
    code: string;
    expiresInSeconds: number;
  }): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.otpSender.send(message);
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  private secondsUntil(target: Date, from: Date): number {
    return Math.max(1, Math.ceil((target.getTime() - from.getTime()) / 1000));
  }
}