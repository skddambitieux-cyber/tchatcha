/**
 * TCHATCHA — Port : trace d'audit OTP (table `authz.otp_codes`, 06a §1).
 * 29-tests-auth.md : chaque `request` → 1 row (`purpose`, `code_hash` SHA-256,
 * `attempts`, `used_at`) ; jamais de code en clair.
 */
import { OtpPurpose } from '../../domain/entities/otp-code.entity';

export interface OtpAuditRow {
  countryCode: string;
  phone: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
}

export interface OtpAuditRepositoryPort {
  record(row: OtpAuditRow): Promise<void>;
  /** Met à jour le compteur d'essais de la dernière trace du numéro/purpose. */
  updateAttempts(
    phone: string,
    purpose: OtpPurpose,
    attempts: number,
  ): Promise<void>;
  /** Pose used_at sur la dernière trace du numéro/purpose. */
  markUsed(
    phone: string,
    purpose: OtpPurpose,
    usedAt: Date,
  ): Promise<void>;
}

export const OtpAuditRepositoryPortToken = 'OtpAuditRepositoryPort';