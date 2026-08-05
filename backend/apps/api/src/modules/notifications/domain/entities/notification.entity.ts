/**
 * TCHATCHA — notif.notifications (06b §5). Envois + boîte in-app.
 * Le métier n'écrit jamais ici : il émet un événement (Outbox audit.events),
 * le module notifications compose et dispatch (ADR-016).
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum NotificationChannel {
  PUSH = 'PUSH',
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  IN_APP = 'IN_APP',
}

@Entity({ schema: 'notif', name: 'notifications' })
@Index('idx_notifications_user', ['user_id', 'read_at'])
@Index('idx_notifications_pending', ['status'])
export class Notification extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 48 })
  type: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 24 })
  channel: NotificationChannel;

  @Column({ type: 'varchar', length: 24 })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  sent_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  read_at: Date | null;
}

/**
 * TCHATCHA — notif.notification_templates (06b §5). Multilingue (ADR-014),
 * placeholders `{{client_name}}`. Modifiable en base, zéro déploiement.
 */
@Entity({ schema: 'notif', name: 'notification_templates' })
@Index('uq_templates', ['code', 'channel', 'language'], { unique: true })
export class NotificationTemplate {
  @Column({ type: 'uuid', primary: true })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 24 })
  channel: string;

  @Column({ type: 'varchar', length: 10 })
  language: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  subject: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'timestamptz' })
  updated_at: Date;
}