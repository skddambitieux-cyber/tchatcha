/**
 * TCHATCHA — users.user_settings (06a §2). Préférences (langue, canaux notif).
 */
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { User } from '../../../auth/domain/entities/user.entity';

@Entity({ schema: 'users', name: 'user_settings' })
export class UserSettings {
  @Column({ type: 'uuid', primary: true })
  user_id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  language: string;

  @Column({
    type: 'jsonb',
    default: { push: true, sms: false, email: true, whatsapp: false },
  })
  notif_channels: Record<string, boolean>;

  @Column({ type: 'jsonb', nullable: true })
  quiet_hours: Record<string, string> | null;

  @Column({ type: 'timestamptz' })
  updated_at: Date;
}