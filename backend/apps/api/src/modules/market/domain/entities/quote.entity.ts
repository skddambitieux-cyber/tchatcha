/**
 * TCHATCHA — market.quotes (06b §1). Devis/réponses des pros, contre-offres
 * via parent_quote_id (négociation rempl<->client).
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum QuoteStatus {
  PENDING = 'PENDING',
  COUNTERED = 'COUNTERED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

@Entity({ schema: 'market', name: 'quotes' })
@Index('idx_quotes_request', ['request_id', 'created_at'])
@Index('idx_quotes_pro', ['professional_id', 'created_at'])
@Index('uq_quotes_active', ['request_id', 'professional_id'], {
  unique: true,
  where: "status = 'PENDING'",
})
export class Quote extends BaseEntity {
  @Column({ type: 'uuid' })
  request_id: string;

  @Column({ type: 'uuid' })
  professional_id: string;

  @Column({ type: 'uuid', nullable: true })
  parent_quote_id: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  price: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'smallint', nullable: true })
  duration_days: number | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'varchar', length: 32 })
  status: QuoteStatus;

  @Column({ type: 'timestamptz', nullable: true })
  accepted_at: Date | null;

  @Column({ type: 'int', default: 1 })
  version: number;
}