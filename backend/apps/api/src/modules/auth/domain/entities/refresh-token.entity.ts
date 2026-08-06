/**
 * TCHATCHA — auth.refresh_tokens (06a §1). Sessions longues, rotation (ADR-004).
 * Token hashé en base — token en clair jamais stocké.
 */
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';
import { User } from './user.entity';

@Entity({ schema: 'authz', name: 'refresh_tokens' })
@Index('uq_refresh_tokens_token_hash', ['token_hash'], { unique: true })
@Index('idx_refresh_tokens_user', ['user_id', 'revoked_at'])
export class RefreshToken extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_refresh_tokens_user_id', ['user_id'])
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 64 })
  token_hash: string;

  @Column({ type: 'varchar', length: 64 })
  device_id: string;

  @Column({ type: 'inet' })
  ip: string;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @OneToOne(() => RefreshToken)
  @JoinColumn({ name: 'replaced_by' })
  replaced_by: RefreshToken | null;
}