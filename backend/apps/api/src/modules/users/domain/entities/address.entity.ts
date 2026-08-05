/**
 * TCHATCHA — users.addresses (06a §2). MCP/JSON: adresses enregistrées.
 */
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';
import { User } from '../../../auth/domain/entities/user.entity';

@Entity({ schema: 'users', name: 'addresses' })
@Index('idx_addresses_user', ['user_id'])
export class Address extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ type: 'uuid', nullable: true })
  division_id: string | null;

  @Column({ type: 'varchar', length: 64 })
  label: string;

  @Column({ type: 'text', nullable: true })
  address_line: string | null;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: unknown;

  @Column({ type: 'boolean', default: false })
  is_default: boolean;
}