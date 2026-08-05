/**
 * TCHATCHA — pros.categories (06a §4). Arborescence : la liste des métiers est
 * une DONNÉE seedable, pas du code (Open/Closed — 20-catalogue-benin.md).
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

@Entity({ schema: 'pros', name: 'categories' })
@Index('uq_categories_slug', ['country_code', 'slug'], { unique: true })
@Index('idx_categories_parent', ['parent_id'])
export class Category extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  parent_id: string | null;

  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 140 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  icon_url: string | null;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'jsonb', default: {} })
  translations: Record<string, string>;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}