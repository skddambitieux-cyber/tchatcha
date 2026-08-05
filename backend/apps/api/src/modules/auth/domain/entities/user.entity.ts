/**
 * TCHATCHA — users.users (06a §2). Compte racine : client, pro, livreur, admin.
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum UserStatus {
  PENDING_OTP = 'PENDING_OTP',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
}

@Entity({ schema: 'users', name: 'users' })
export class User extends BaseEntity {
  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'varchar', length: 20 })
  @Index('uq_users_phone', { unique: true })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255 })
  password_hash: string;

  @Column({ type: 'varchar', length: 120 })
  full_name: string;

  @Column({ type: 'text', nullable: true })
  avatar_url: string | null;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  locale: string;

  @Column({ type: 'varchar', length: 32 })
  @Index('uq_users_email', { unique: true })
  status: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  otp_verified_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_login_at: Date | null;

  @Column({ type: 'jsonb', default: {} })
  flags: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  anonymized_at: Date | null;

  @Column({ type: 'int', default: 1 })
  version: number;
}