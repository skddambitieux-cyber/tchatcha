/**
 * TCHATCHA — pros.services (06a §4). Services offerts par un pro
 * (un pro peut exercer plusieurs métiers).
 */
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';
import { ProfessionalProfile } from './professional-profile.entity';

@Entity({ schema: 'pros', name: 'services' })
@Index('idx_services_category', ['category_id', 'is_primary'])
export class Service extends BaseEntity {
  @Column({ type: 'uuid' })
  professional_id: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @Column({ type: 'uuid' })
  category_id: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  price_from: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  price_to: number | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  price_unit: string | null;

  @Column({ type: 'boolean', default: false })
  is_primary: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;
}

/**
 * TCHATCHA — pros.locations (06a §4). Position + rayon d'intervention (PostGIS).
 */
@Entity({ schema: 'pros', name: 'locations' })
@Index('idx_pros_locations_gist', ['location'], { spatial: true })
export class ProLocation {
  @Column({ type: 'uuid', primary: true })
  professional_id: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'uuid', nullable: true })
  division_id: string | null;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: unknown;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 10 })
  service_radius_km: number;

  @Column({ type: 'text', nullable: true })
  address_text: string | null;

  @Column({ type: 'timestamptz' })
  updated_at: Date;
}

/**
 * TCHATCHA — pros.business_hours (06a §4). Horaires hebdomadaires.
 */
@Entity({ schema: 'pros', name: 'business_hours' })
export class BusinessHour {
  @Column({ type: 'uuid', primary: true })
  professional_id: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @Column({ type: 'smallint', primary: true })
  weekday: number;

  @Column({ type: 'time' })
  open_at: string;

  @Column({ type: 'time' })
  close_at: string;

  @Column({ type: 'boolean', default: false })
  closed: boolean;
}