/**
 * TCHATCHA — Adapter TypeORM du port ProfessionalVerificationRepository (38 §5).
 * SQL brut sur pros.verifications + media.files + admin.validation_tasks
 * (isolation de module, D-PORT-1). Création et réactivation = transactions
 * complètes (ligne + tâche admin, RF-VR-03/04/05).
 * Note : manager.query renvoie [rows, rowCount] (PostgresQueryRunner) —
 * extraction `[rows]` systématique.
 */
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ProfessionalVerificationRepository,
  VerificationRecord,
} from '../../application/ports/professional-verification-repository.port';

interface VerificationRow {
  id: string;
  professional_id: string;
  type: string;
  media_id: string;
  mime_type: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  note: string | null;
  created_at: Date;
}

function toRecord(row: VerificationRow): VerificationRecord {
  return {
    id: row.id,
    professional_id: row.professional_id,
    type: row.type,
    media_id: row.media_id,
    mime_type: row.mime_type,
    status: row.status,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
    note: row.note,
    created_at: new Date(row.created_at),
  };
}

const VERIFICATION_COLUMNS = `v.id, v.professional_id, v.type, v.media_id,
       m.mime_type, v.status, v.reviewed_by, v.reviewed_at, v.note, v.created_at`;

@Injectable()
export class TypeOrmProfessionalVerificationRepository
  implements ProfessionalVerificationRepository
{
  constructor(private readonly dataSource: DataSource) {}

  async findByType(
    userId: string,
    type: string,
  ): Promise<VerificationRecord | null> {
    const rows = await this.dataSource.query(
      `SELECT ${VERIFICATION_COLUMNS}
         FROM pros.verifications v
         JOIN pros.profiles p ON p.id = v.professional_id AND p.user_id = $1
         JOIN media.files m ON m.id = v.media_id
        WHERE v.type = $2
        ORDER BY v.created_at DESC
        LIMIT 1`,
      [userId, type],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async listByProfessional(userId: string): Promise<VerificationRecord[]> {
    const rows = await this.dataSource.query(
      `SELECT ${VERIFICATION_COLUMNS}
         FROM pros.verifications v
         JOIN pros.profiles p ON p.id = v.professional_id AND p.user_id = $1
         JOIN media.files m ON m.id = v.media_id
        ORDER BY v.type, v.created_at ASC`,
      [userId],
    );
    return (rows ?? []).map(toRecord);
  }

  async isMediaReferenced(mediaId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM pros.verifications WHERE media_id = $1 LIMIT 1`,
      [mediaId],
    );
    return rows.length > 0;
  }

  async createPending(input: {
    userId: string;
    type: string;
    mediaId: string;
  }): Promise<VerificationRecord> {
    return this.dataSource.transaction(async (manager) => {
      // INSERT ... RETURNING renvoie directement le tableau des lignes
      // (pattern TypeOrmMediaFileRepository.createPending) — pas de
      // déstructuration [rows, rowCount] (réservée UPDATE/DELETE).
      const rows = await manager.query(
        `INSERT INTO pros.verifications (
           id, professional_id, type, media_id, status, created_at, updated_at
         ) VALUES (
           gen_random_uuid(),
           (SELECT id FROM pros.profiles WHERE user_id = $1),
           $2, $3, 'PENDING', now(), now()
         )
         RETURNING id, professional_id, type, media_id, status, reviewed_by,
                   reviewed_at, note, created_at`,
        [input.userId, input.type, input.mediaId],
      );
      const row = rows[0];
      await manager.query(
        `INSERT INTO admin.validation_tasks (
           id, entity_type, entity_id, status, created_at, updated_at
         ) VALUES (gen_random_uuid(), 'PRO_VERIFICATION', $1, 'PENDING', now(), now())`,
        [row.id],
      );
      return {
        ...toRecord({ ...row, mime_type: '' }),
        status: 'PENDING',
      };
    });
  }

  async reactivateRejected(
    userId: string,
    verificationId: string,
    mediaId: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const [rows] = await manager.query(
        `UPDATE pros.verifications SET
           media_id = $3, status = 'PENDING', reviewed_by = NULL,
           reviewed_at = NULL, note = NULL, updated_at = now()
         WHERE id = $1
           AND professional_id = (SELECT id FROM pros.profiles WHERE user_id = $2)
           AND status = 'REJECTED'
         RETURNING id`,
        [verificationId, userId, mediaId],
      );
      if (rows.length === 0) return false;
      await manager.query(
        `UPDATE admin.validation_tasks SET
           status = 'PENDING', decided_by = NULL, decided_at = NULL,
           note = NULL, updated_at = now()
         WHERE entity_type = 'PRO_VERIFICATION' AND entity_id = $1`,
        [verificationId],
      );
      return true;
    });
  }
}
