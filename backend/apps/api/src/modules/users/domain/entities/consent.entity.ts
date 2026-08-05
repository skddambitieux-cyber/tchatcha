/**
 * TCHATCHA — users.consents (06a §2). Consentements RGPD/loi locale (06d §6).
 */
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';
import { User } from '../../../auth/domain/entities/user.entity';

export enum ConsentType {
  TOS = 'TOS',
  PRIVACY = 'PRIVACY',
  MARKETING = 'MARKETING',
  LOCATION = 'LOCATION',
  DATA_PROCESSING = 'DATA_PROCESSING',
}

@Entity({ schema: 'users', name: 'consents' })
@Index('uq_consents', ['user_id', 'type'], { unique: true })
export class Consent extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 32 })
  type: ConsentType;

  @Column({ type: 'varchar', length: 16 })
  version: string;

  @Column({ type: 'boolean' })
  granted: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  granted_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;
}