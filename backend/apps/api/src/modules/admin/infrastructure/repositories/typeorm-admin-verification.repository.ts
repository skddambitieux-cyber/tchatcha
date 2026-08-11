import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { deriveLevel } from '../../../professionals/application/services/professional-verification.service';
import type { VerificationRecord } from '../../../professionals/application/ports/professional-verification-repository.port';
import type { AdminVerificationItem, AdminVerificationRepository, DecisionResult } from '../../application/ports/admin-verification-repository.port';

type Row = AdminVerificationItem & { professional_user_id?: string; total?: string | number };
const COLS = `v.id, v.professional_id, v.type, v.media_id, m.mime_type, m.s3_key,
  v.status, v.reviewed_by, v.reviewed_at, v.note, v.created_at, p.business_name`;

function record(row: Row): VerificationRecord {
  return { id: row.id, professional_id: row.professional_id, type: row.type,
    media_id: row.media_id, mime_type: row.mime_type, status: row.status,
    reviewed_by: row.reviewed_by, reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : null,
    note: row.note, created_at: new Date(row.created_at) };
}

@Injectable()
export class TypeOrmAdminVerificationRepository implements AdminVerificationRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(status: string, page: number, limit: number) {
    const rows: Row[] = await this.dataSource.query(
      `SELECT ${COLS}, count(*) OVER() AS total
       FROM pros.verifications v JOIN pros.profiles p ON p.id=v.professional_id
       JOIN media.files m ON m.id=v.media_id
       WHERE v.status=$1 ORDER BY v.created_at ASC OFFSET $2 LIMIT $3`,
      [status, (page - 1) * limit, limit],
    );
    return { items: rows.map((r) => ({ ...record(r), business_name: r.business_name, s3_key: r.s3_key })),
      total: rows.length ? Number(rows[0].total) : 0 };
  }

  async decide(id: string, adminId: string, approve: boolean, reason: string | null): Promise<DecisionResult | 'NOT_FOUND' | 'INVALID_STATE'> {
    return this.dataSource.transaction(async (manager) => {
      const rows: Row[] = await manager.query(
        `SELECT ${COLS}, p.user_id AS professional_user_id FROM pros.verifications v
         JOIN pros.profiles p ON p.id=v.professional_id JOIN media.files m ON m.id=v.media_id
         WHERE v.id=$1 FOR UPDATE OF v`, [id]);
      const current = rows[0];
      if (!current) return 'NOT_FOUND';
      if (current.status === 'REJECTED' || (current.status === 'APPROVED' && approve)) return 'INVALID_STATE';
      const status = approve ? 'APPROVED' : 'REJECTED';
      await manager.query(`UPDATE pros.verifications SET status=$2, reviewed_by=$3,
        reviewed_at=now(), note=$4, updated_at=now() WHERE id=$1`, [id, status, adminId, reason]);
      await manager.query(`UPDATE admin.validation_tasks SET status='COMPLETED', decided_by=$2,
        decided_at=now(), note=$3, updated_at=now() WHERE entity_type='PRO_VERIFICATION' AND entity_id=$1`,
        [id, adminId, reason]);
      const dossierRows: Row[] = await manager.query(
        `SELECT ${COLS} FROM pros.verifications v JOIN pros.profiles p ON p.id=v.professional_id
         JOIN media.files m ON m.id=v.media_id WHERE v.professional_id=$1 ORDER BY v.type,v.created_at`,
        [current.professional_id]);
      const dossier = dossierRows.map(record);
      const level = deriveLevel(dossier);
      await manager.query(`UPDATE pros.profiles SET verified=$2, verified_at=CASE
        WHEN $2 AND verified_at IS NULL THEN now() WHEN NOT $2 THEN NULL ELSE verified_at END,
        updated_at=now() WHERE id=$1`, [current.professional_id, level >= 2]);
      await manager.query(`INSERT INTO pros.reputation (
          professional_id, completed_jobs, disputes_count, seniority_days,
          verification_level, trust_score, trust_level,
          recomputed_at, created_at, updated_at
        ) VALUES ($1,0,0,0,$2,0,'NEW',now(),now(),now())
        ON CONFLICT (professional_id) DO UPDATE
        SET verification_level=EXCLUDED.verification_level,
            recomputed_at=now(), updated_at=now()`, [current.professional_id, level]);
      const changed = dossier.find((v) => v.id === id) as VerificationRecord;
      changed.status = status; changed.reviewed_by = adminId; changed.reviewed_at = new Date(); changed.note = reason;
      return { professionalUserId: current.professional_user_id as string,
        professionalId: current.professional_id, verification: changed, dossier, level };
    });
  }
}
