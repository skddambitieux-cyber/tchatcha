/**
 * TCHATCHA — audit.events / audit.aggregate_events (06b §7).
 * Outbox (propagation inter-modules, exactement-une-fois — ADR-002/016)
 * + journal d'événements d'agrégat (Event Sourcing léger — 06d §1).
 */
import { Column, Entity, Index } from 'typeorm';

/** audit.events — Outbox : écrit en même transaction que l'état métier. */
@Entity({ schema: 'audit', name: 'events' })
@Index('idx_events_status', ['status', 'created_at'])
export class OutboxEvent {
  @Column({ type: 'uuid', primary: true })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  aggregate_type: string;

  @Column({ type: 'uuid' })
  aggregate_id: string;

  @Column({ type: 'varchar', length: 64 })
  event_type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 24 })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}

/** audit.aggregate_events — historique permanent, append-only. */
@Entity({ schema: 'audit', name: 'aggregate_events' })
@Index('uq_aggregate_events', ['aggregate_type', 'aggregate_id', 'version'], {
  unique: true,
})
@Index('idx_aggregate_events_time', ['created_at'])
export class AggregateEvent {
  @Column({ type: 'uuid', primary: true })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  aggregate_type: string;

  @Column({ type: 'uuid' })
  aggregate_id: string;

  @Column({ type: 'bigint' })
  version: number;

  @Column({ type: 'varchar', length: 64 })
  event_type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string | null;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}

/**
 * TCHATCHA — audit.logs (06b §7). Journal d'audit des actions sensibles
 * (« qui a fait quoi, quand, avec quelles valeurs »).
 */
@Entity({ schema: 'audit', name: 'logs' })
@Index('idx_audit_entity', ['entity_type', 'entity_id', 'created_at'])
@Index('idx_audit_actor', ['actor_id', 'created_at'])
@Index('idx_audit_action', ['action', 'created_at'])
export class AuditLog {
  @Column({ type: 'uuid', primary: true })
  id: string;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string | null;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 32 })
  entity_type: string;

  @Column({ type: 'uuid' })
  entity_id: string;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  country_code: string | null;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}