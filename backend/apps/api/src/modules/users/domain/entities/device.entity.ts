/**
 * TCHATCHA — users.devices (06a §2). Appareils + token FCM (push).
 */
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';
import { User } from '../../../auth/domain/entities/user.entity';

@Entity({ schema: 'users', name: 'devices' })
@Index('uq_devices_device', ['user_id', 'device_id'], { unique: true })
@Index('idx_devices_fcm', ['fcm_token'])
export class Device extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 64 })
  device_id: string;

  @Column({ type: 'varchar', length: 16 })
  platform: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fcm_token: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_seen_at: Date | null;
}