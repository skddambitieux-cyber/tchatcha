/**
 * TCHATCHA — market.service_requests (06b §1). Publication d'un besoin
 * (Mode B). Agrégat racine du domaine. Machine à états : 06-schema-base §10.
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum RequestStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  QUOTED = 'QUOTED',
  ACCEPTED = 'ACCEPTED',
  BOOKED = 'BOOKED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  DISPUTED = 'DISPUTED',
}

export enum Urgency {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  EMERGENCY = 'EMERGENCY',
}

@Entity({ schema: 'market', name: 'service_requests' })
@Index('idx_requests_status_expires', ['status', 'expires_at'])
@Index('idx_requests_category_created', ['category_id', 'created_at'])
@Index('idx_requests_client', ['client_id', 'created_at'])
@Index('idx_requests_location', ['location'], { spatial: true })
export class ServiceRequest extends BaseEntity {
  @Column({ type: 'uuid' })
  client_id: string;

  @Column({ type: 'uuid' })
  category_id: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'uuid', nullable: true })
  division_id: string | null;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: unknown;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  budget_min: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  budget_max: number | null;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'timestamptz', nullable: true })
  desired_date: Date | null;

  @Column({ type: 'varchar', length: 24, default: Urgency.NORMAL })
  urgency: Urgency;

  @Column({ type: 'varchar', length: 32 })
  status: RequestStatus;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'uuid', nullable: true })
  canceled_by: string | null;

  @Column({ type: 'text', nullable: true })
  cancel_reason: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'uuid', nullable: true })
  client_idempotency_key: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  client_request_hash: string | null;
}
