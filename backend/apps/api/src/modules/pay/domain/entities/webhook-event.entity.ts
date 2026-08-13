/**
 * TCHATCHA — pay.webhook_events (06b §2). Événements webhook entrants traités
 * de façon idempotente (uq_webhook_events) : rejeu sans double débit.
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

@Entity({ schema: 'pay', name: 'webhook_events' })
@Index('uq_webhook_events', ['provider_code', 'external_ref', 'event_type'], {
  unique: true,
})
@Index('idx_webhook_events_pending', ['processed_at'], { where: 'processed_at IS NULL' })
export class WebhookEvent extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  provider_code: string;

  @Column({ type: 'varchar', length: 128 })
  external_ref: string;

  @Column({ type: 'varchar', length: 64 })
  event_type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  processed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  processing_error: string | null;
}