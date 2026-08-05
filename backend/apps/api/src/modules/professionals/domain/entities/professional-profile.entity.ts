/**
 * TCHATCHA — pros.profiles (06a §4). Fiche professionnelle (vitrine).
 * Agrégats dénormalisés : rating_avg, trust_score, completed_jobs.
 */
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';
import { User } from '../../../auth/domain/entities/user.entity';

export enum ProfessionalStatus {
  DRAFT = 'DRAFT',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity({ schema: 'pros', name: 'profiles' })
@Index('uq_profiles_user', ['user_id'], { unique: true })
@Index('idx_profiles_rating', ['status', 'country_code', 'rating_avg'])
export class ProfessionalProfile extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 120, nullable: true })
  business_name: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  headline: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'smallint', nullable: true })
  experience_years: number | null;

  @Column({ type: 'smallint', nullable: true })
  employees_count: number | null;

  @Column({ type: 'varchar', length: 32 })
  status: ProfessionalStatus;

  @Column({ type: 'boolean', default: false })
  @Index('idx_profiles_verified', ['verified'])
  verified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  verified_at: Date | null;

  @Column({ type: 'numeric', precision: 2, scale: 1, default: 0 })
  rating_avg: number;

  @Column({ type: 'int', default: 0 })
  rating_count: number;

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  trust_score: number;

  @Column({ type: 'int', default: 0 })
  completed_jobs: number;

  @Column({ type: 'int', nullable: true })
  response_time_min: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  min_price: number | null;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ type: 'jsonb', nullable: true })
  social_links: Record<string, string> | null;

  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'int', default: 1 })
  version: number;
}