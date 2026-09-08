/**
 * TCHATCHA — review.reviews (06b §3). Avis post-prestation (PRD §11).
 * Sous-notes : ponctualité, qualité, rapport qualité/prix, politesse.
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum ReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FLAGGED = 'FLAGGED',
}

@Entity({ schema: 'review', name: 'reviews' })
@Index('uq_reviews_booking', ['booking_id'], { unique: true })
@Index('idx_reviews_reviewee', ['reviewee_id', 'status', 'created_at'])
@Index('idx_reviews_reviewer', ['reviewer_id', 'created_at'])
@Index('idx_reviews_status', ['status'])
export class Review extends BaseEntity {
  @Column({ type: 'uuid' })
  booking_id: string;

  @Column({ type: 'uuid' })
  request_id: string;

  @Column({ type: 'uuid' })
  reviewer_id: string;

  @Column({ type: 'uuid' })
  reviewee_id: string;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'smallint' })
  punctuality: number;

  @Column({ type: 'smallint' })
  quality: number;

  @Column({ type: 'smallint' })
  price_ratio: number;

  @Column({ type: 'smallint' })
  politeness: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'uuid', nullable: true })
  idempotency_key: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  request_hash: string | null;

  @Column({ type: 'jsonb', nullable: true })
  response_snapshot: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  is_late: boolean;

  @Column({ type: 'smallint', default: 0 })
  edit_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  edited_at: Date | null;

  @Column({ type: 'varchar', length: 32 })
  status: ReviewStatus;

  @Column({ type: 'uuid', nullable: true })
  moderated_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  moderated_at: Date | null;

  @Column({ type: 'int', default: 0 })
  helpful_count: number;
}

@Entity({ schema: 'review', name: 'professional_review_stats' })
export class ProfessionalReviewStats {
  @Column({ type: 'uuid', primary: true })
  professional_id: string;

  @Column({ type: 'numeric', precision: 4, scale: 3, nullable: true })
  rating_avg: number | null;

  @Column({ type: 'numeric', precision: 4, scale: 3, nullable: true })
  punctuality_avg: number | null;

  @Column({ type: 'numeric', precision: 4, scale: 3, nullable: true })
  quality_avg: number | null;

  @Column({ type: 'numeric', precision: 4, scale: 3, nullable: true })
  price_ratio_avg: number | null;

  @Column({ type: 'numeric', precision: 4, scale: 3, nullable: true })
  politeness_avg: number | null;

  @Column({ type: 'timestamptz' })
  updated_at: Date;
}

@Entity({ schema: 'review', name: 'review_edits' })
@Index('uq_review_edits_review', ['review_id'], { unique: true })
export class ReviewEdit {
  @Column({ type: 'uuid', primary: true })
  id: string;

  @Column({ type: 'uuid' })
  review_id: string;

  @Column({ type: 'uuid' })
  actor_id: string;

  @Column({ type: 'jsonb' })
  before: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  after: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}

@Entity({ schema: 'review', name: 'responses' })
@Index('uq_review_responses_review', ['review_id'], { unique: true })
@Index('uq_review_responses_idempotency', ['professional_id', 'idempotency_key'], { unique: true })
export class ReviewResponse {
  @Column({ type: 'uuid', primary: true })
  id: string;

  @Column({ type: 'uuid' })
  review_id: string;

  @Column({ type: 'uuid' })
  professional_id: string;

  @Column({ type: 'varchar', length: 500 })
  body: string;

  @Column({ type: 'uuid' })
  idempotency_key: string;

  @Column({ type: 'char', length: 64 })
  request_hash: string;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}

/**
 * TCHATCHA — review.review_flags (06b §3). Signalements d'avis.
 */
@Entity({ schema: 'review', name: 'review_flags' })
@Index('uq_review_flags', ['review_id', 'flagged_by'], { unique: true })
export class ReviewFlag {
  @Column({ type: 'uuid', primary: true })
  id: string;

  @Column({ type: 'uuid' })
  review_id: string;

  @Column({ type: 'uuid' })
  flagged_by: string;

  @Column({ type: 'varchar', length: 64 })
  reason: string;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  idempotency_key: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  request_hash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resolved_by: string | null;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}
