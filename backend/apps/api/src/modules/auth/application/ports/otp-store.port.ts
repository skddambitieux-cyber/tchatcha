/**
 * TCHATCHA — Port : store OTP chaud (état) — lot 6.2.
 * ADR-004 : la vérification chaude vit en mémoire/Redis ; authz.otp_codes reste
 * la trace d'audit. Les compteurs cooldown/fenêtre/verrouillage y sont aussi
 * portés (D-STORE-1).
 */
import { OtpPurpose } from '../../domain/entities/otp-code.entity';

export interface PendingOtp {
  /** Clé logique = country_code + phone + purpose (immutables). */
  phone: string;
  purpose: OtpPurpose;
  /** Hash SHA-256 du code — jamais en clair dans le store. */
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
}

export interface OtpSendState {
  /** Timestamp du dernier envoi (cooldown 45 s). */
  lastSentAt: Date | null;
  /** Horodatages des envois des 15 dernières minutes (fenêtre 5 envois max). */
  sendAt: Date[];
  /** Verrouillage 15 min (phone_locked), null si libre. */
  lockedUntil: Date | null;
}

export const OTP_TTL_SECONDS = 300;
export const OTP_COOLDOWN_SECONDS = 45;
export const OTP_WINDOW_SECONDS = 900;
export const OTP_MAX_SENDS_PER_WINDOW = 5;
export const OTP_MAX_ATTEMPTS = 3;

/**
 * Port de stockage état chaud OTP. Implémentation attendue : Redis (P2+).
 * Le contrat est testé contre une implémentation mémoire fournie au module.
 */
export interface OtpStorePort {
  saveOtp(otp: PendingOtp): Promise<void>;
  /**
   * Retourne l'OTP en attente pour un numéro/purpose, null s'il n'existe pas
   * (les OTP expirés sont retournés : le service applique l'expiration —
   * permet de distinguer OtpExpired de NoPendingOtp).
   */
  findOtp(phone: string, purpose: OtpPurpose): Promise<PendingOtp | null>;
  /**
   * Consomme l'OTP de façon atomique (usage unique). Retourne true si ce
   * processus a posé used_at, false si l'OTP était déjà utilisé (garantit
   * qu'une double vérification simultanée ne réussit qu'une fois).
   */
  consume(phone: string, purpose: OtpPurpose, usedAt: Date): Promise<boolean>;
  /** Invalide un OTP (après exhaustion ou expiration). */
  invalidate(phone: string, purpose: OtpPurpose): Promise<void>;
  /** Incrémente le compteur d'essais. Retourne le nouveau compteur. */
  incrementAttempts(phone: string, purpose: OtpPurpose): Promise<number>;
  /** Retourne l'état d'envoi du numéro (cooldown/fenêtre/verrouillage). */
  getSendState(phone: string): Promise<OtpSendState>;
  /** Enregistre un envoi (met à jour lastSentAt + fenêtre). */
  recordSend(phone: string, at: Date): Promise<void>;
  /** Verrouille le canal 15 min. */
  lock(phone: string, until: Date): Promise<void>;
}

export const OtpStorePortToken = 'OtpStorePort';