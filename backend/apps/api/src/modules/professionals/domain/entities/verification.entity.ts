/**
 * TCHATCHA — pros.verifications (38 §5, docs/06a L454-470). Dossier de
 * vérification du professionnel : une ligne par document soumis
 * (NATIONAL_ID / SELFIE obligatoires, PRO_DOCUMENT / DIPLOMA optionnels).
 * La file de modération (admin.validation_tasks) référence entity_id = id.
 */
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

export enum VerificationType {
  NATIONAL_ID = 'NATIONAL_ID',
  SELFIE = 'SELFIE',
  PRO_DOCUMENT = 'PRO_DOCUMENT',
  DIPLOMA = 'DIPLOMA',
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity({ schema: 'pros', name: 'verifications' })
@Index('idx_verifications_status', ['status'])
@Index('idx_verifications_pro', ['professional_id', 'status'])
export class ProsVerification extends BaseEntity {
  @Column({ type: 'uuid' })
  professional_id: string;

  @Column({ type: 'varchar', length: 24 })
  type: string;

  @Column({ type: 'uuid' })
  media_id: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
