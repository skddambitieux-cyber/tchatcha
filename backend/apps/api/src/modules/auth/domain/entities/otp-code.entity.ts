/**
 * TCHATCHA — auth.otp_codes (06a §1). Codes à usage unique (trace d'audit,
 * la vérification chaude vit dans Redis — ADR-004). Hash SHA-256 jamais en clair.
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum OtpPurpose {
  REGISTER = 'REGISTER',
  LOGIN = 'LOGIN',
  RESET_PASSWORD = 'RESET_PASSWORD',
  PAYMENT = 'PAYMENT',
}

@Entity({ schema: 'authz', name: 'otp_codes' })
export class OtpCode extends BaseEntity {
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_otp_phone_purpose_created', ['phone', 'purpose', 'created_at'])
  phone: string;

  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'varchar', length: 32 })
  purpose: OtpPurpose;

  @Column({ type: 'varchar', length: 64 })
  code_hash: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  used_at: Date | null;
}