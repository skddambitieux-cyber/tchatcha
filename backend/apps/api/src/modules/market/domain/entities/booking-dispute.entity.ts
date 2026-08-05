/**
 * TCHATCHA — market.bookings (06b §1). Réservation/rendez-vous après
 * acceptation du devis. Verrouille le créneau pro + double confirmation.
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum BookingStatus {
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
  DISPUTED = 'DISPUTED',
  REFUNDED = 'REFUNDED',
}

@Entity({ schema: 'market', name: 'bookings' })
@Index('uq_bookings_quote', ['quote_id'], { unique: true })
@Index('idx_bookings_pro_date', ['professional_id', 'scheduled_start'])
@Index('idx_bookings_client', ['client_id', 'scheduled_start'])
@Index('idx_bookings_status', ['status'])
export class Booking extends BaseEntity {
  @Column({ type: 'uuid' })
  request_id: string;

  @Column({ type: 'uuid' })
  quote_id: string;

  @Column({ type: 'uuid' })
  client_id: string;

  @Column({ type: 'uuid' })
  professional_id: string;

  @Column({ type: 'timestamptz' })
  scheduled_start: Date;

  @Column({ type: 'timestamptz', nullable: true })
  scheduled_end: Date | null;

  @Column({ type: 'varchar', length: 32 })
  status: BookingStatus;

  @Column({ type: 'timestamptz', nullable: true })
  client_confirmed_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  pro_confirmed_at: Date | null;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: unknown;

  @Column({ type: 'text', nullable: true })
  address_text: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;
}

/**
 * TCHATCHA — market.disputes (06b §1). Litiges post-paiement (BR-100..105).
 */
@Entity({ schema: 'market', name: 'disputes' })
@Index('idx_disputes_status', ['status'])
@Index('uq_disputes_booking_open', ['booking_id'], {
  unique: true,
  where: "status IN ('OPEN','UNDER_REVIEW')",
})
export class Dispute extends BaseEntity {
  @Column({ type: 'uuid' })
  booking_id: string;

  @Column({ type: 'uuid' })
  opened_by: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolved_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;
}