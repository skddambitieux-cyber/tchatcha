/**
 * TCHATCHA — media.files (06b §8). UNE table pour tous les médias
 * (portfolio, pièces jointes, photos d'avis, certificats, messages).
 * Polymorphisme owner_type/owner_id volontaire (06d §5).
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum MediaStatus {
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

@Entity({ schema: 'media', name: 'files' })
@Index('idx_media_owner', ['owner_type', 'owner_id', 'sort_order'])
@Index('idx_media_s3', ['s3_key'])
export class MediaFile extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  owner_type: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 32 })
  purpose: string;

  @Column({ type: 'varchar', length: 16 })
  media_type: string;

  @Column({ type: 'varchar', length: 64 })
  mime_type: string;

  @Column({ type: 'bigint', default: 0 })
  size_bytes: number;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'int', nullable: true })
  duration_sec: number | null;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'varchar', length: 512 })
  s3_key: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'varchar', length: 16 })
  status: MediaStatus;
}

/**
 * TCHATCHA — pros.reputation (06a §4). Métriques du Trust Score (06d §2).
 * Cache calculé par job nocturne + événements structurels.
 */
@Entity({ schema: 'pros', name: 'reputation' })
@Index('idx_reputation_score', ['trust_score'])
export class Reputation {
  @Column({ type: 'uuid', primary: true })
  professional_id: string;

  @Column({ type: 'int', default: 0 })
  completed_jobs: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  acceptance_rate: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  cancellation_rate: number | null;

  @Column({ type: 'int', nullable: true })
  avg_response_min: number | null;

  @Column({ type: 'numeric', precision: 2, scale: 1, nullable: true })
  punctuality_avg: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 1, nullable: true })
  avg_execution_days: number | null;

  @Column({ type: 'int', default: 0 })
  disputes_count: number;

  @Column({ type: 'int', default: 0 })
  seniority_days: number;

  @Column({ type: 'smallint', default: 0 })
  verification_level: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  ai_factor: number | null;

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  trust_score: number;

  @Column({ type: 'varchar', length: 16, default: 'NEW' })
  trust_level: string;

  @Column({ type: 'timestamptz' })
  recomputed_at: Date;

  @Column({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'timestamptz' })
  updated_at: Date;
}