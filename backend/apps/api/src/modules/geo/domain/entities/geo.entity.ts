/**
 * TCHATCHA — geo.countries (06a §3). Pays supportés, i18n, devise (ADR-013).
 */
import { Column, Entity } from 'typeorm';

@Entity({ schema: 'geo', name: 'countries' })
export class Country {
  @Column({ type: 'char', length: 2, primary: true })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'jsonb', default: {} })
  name_translations: Record<string, string>;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 8 })
  phone_code: string;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  locale_default: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}

@Entity({ schema: 'geo', name: 'divisions' })
export class Division {
  @Column({ type: 'uuid', primary: true })
  id: string;

  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'uuid', nullable: true })
  parent_id: string | null;

  @Column({ type: 'varchar', length: 24 })
  type: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'jsonb', default: {} })
  name_translations: Record<string, string>;

  @Column({ type: 'int' })
  depth: number;

  @Column({ type: 'ltree', nullable: true })
  path: string | null;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  centroid: unknown;

  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326, nullable: true })
  boundary: unknown;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}