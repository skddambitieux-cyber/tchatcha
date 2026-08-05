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

  @Column({ type: 'varchar', length: 32 })
  status: ReviewStatus;

  @Column({ type: 'uuid', nullable: true })
  moderated_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  moderated_at: Date | null;

  @Column({ type: 'int', default: 0 })
  helpful_count: number;
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

  @Column({ type: 'timestamptz' })
  created_at: Date;
}