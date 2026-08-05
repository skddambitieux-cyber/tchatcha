/**
 * TCHATCHA — admin.validation_tasks (06b §6). File de modération générique.
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

@Entity({ schema: 'admin', name: 'validation_tasks' })
@Index('idx_validation_tasks_status', ['status'])
@Index('idx_validation_tasks_entity', ['entity_type', 'entity_id'])
export class ValidationTask extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  entity_type: string;

  @Column({ type: 'uuid' })
  entity_id: string;

  @Column({ type: 'varchar', length: 24 })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  assignee_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  decided_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decided_at: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}

/**
 * TCHATCHA — admin.bans (06b §6). Sanctions : suspension temporaire ou
 * définitive. N'écrase jamais users.status (historique conservé).
 */
@Entity({ schema: 'admin', name: 'bans' })
@Index('idx_bans_user', ['user_id', 'ends_at'])
export class Ban {
  @Column({ type: 'uuid', primary: true })
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'uuid' })
  banned_by: string;

  @Column({ type: 'timestamptz' })
  starts_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ends_at: Date | null;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}