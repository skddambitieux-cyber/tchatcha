/**
 * TCHATCHA — Adapter TypeORM du port MediaFileRepository (37 §4).
 * SQL brut sur media.files + pros.profiles (isolation de module, D-PORT-1).
 * Note : pour UPDATE/DELETE, manager/queryRunner.query renvoie
 * [rows, rowCount] (PostgresQueryRunner) — extraction `[rows]` systématique.
 */
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  MediaFileRecord,
  MediaFileRepository,
} from '../../domain/ports/media-file-repository.port';

interface MediaRow {
  id: string;
  owner_id: string;
  purpose: string;
  media_type: string;
  mime_type: string;
  size_bytes: string | number;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  url: string;
  s3_key: string;
  sort_order: string | number;
  status: string;
  created_at: Date;
}

function toRecord(row: MediaRow): MediaFileRecord {
  return {
    id: row.id,
    owner_id: row.owner_id,
    purpose: row.purpose,
    media_type: row.media_type,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes),
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    duration_sec: row.duration_sec != null ? Number(row.duration_sec) : null,
    url: row.url,
    s3_key: row.s3_key,
    sort_order: Number(row.sort_order),
    status: row.status,
    created_at: new Date(row.created_at),
  };
}

const MEDIA_COLUMNS = `m.id, m.owner_id, m.purpose, m.media_type, m.mime_type,
       m.size_bytes, m.width, m.height, m.duration_sec, m.url, m.s3_key,
       m.sort_order, m.status, m.created_at`;

// RETURNING ne supporte pas l'alias de table : colonnes sans préfixe.
const MEDIA_COLUMNS_RETURNING = `id, owner_id, purpose, media_type, mime_type,
       size_bytes, width, height, duration_sec, url, s3_key,
       sort_order, status, created_at`;

@Injectable()
export class TypeOrmMediaFileRepository implements MediaFileRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createPending(input: {
    ownerId: string;
    purpose: string;
    mediaType: string;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    url: string;
    s3Key: string;
  }): Promise<MediaFileRecord> {
    const rows = await this.dataSource.query(
      `INSERT INTO media.files (
         id, owner_type, owner_id, purpose, media_type, mime_type, size_bytes,
         width, height, duration_sec, url, s3_key, sort_order, status,
         created_at, updated_at
       ) VALUES (gen_random_uuid(), 'PROFESSIONAL', $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, 0, 'PROCESSING', now(), now())
       RETURNING ${MEDIA_COLUMNS_RETURNING}`,
      [
        input.ownerId,
        input.purpose,
        input.mediaType,
        input.mimeType,
        input.sizeBytes,
        input.width,
        input.height,
        input.durationSec,
        input.url,
        input.s3Key,
      ],
    );
    return toRecord(rows[0]);
  }

  async findOwnedProcessing(
    userId: string,
    mediaId: string,
  ): Promise<MediaFileRecord | null> {
    const rows = await this.dataSource.query(
      `SELECT ${MEDIA_COLUMNS}
         FROM media.files m
         JOIN pros.profiles p ON p.id = m.owner_id AND p.user_id = $1
        WHERE m.id = $2 AND m.owner_type = 'PROFESSIONAL'
          AND m.status = 'PROCESSING' AND m.deleted_at IS NULL
        LIMIT 1`,
      [userId, mediaId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async findOwnedReady(
    userId: string,
    mediaId: string,
  ): Promise<MediaFileRecord | null> {
    const rows = await this.dataSource.query(
      `SELECT ${MEDIA_COLUMNS}
         FROM media.files m
         JOIN pros.profiles p ON p.id = m.owner_id AND p.user_id = $1
        WHERE m.id = $2 AND m.owner_type = 'PROFESSIONAL'
          AND m.status = 'READY' AND m.deleted_at IS NULL
        LIMIT 1`,
      [userId, mediaId],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async markFailed(userId: string, mediaId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE media.files SET status = 'FAILED', updated_at = now()
        WHERE id = $1
          AND owner_type = 'PROFESSIONAL'
          AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $2)
          AND deleted_at IS NULL`,
      [mediaId, userId],
    );
  }

  async markReady(userId: string, mediaId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE media.files SET status = 'READY', updated_at = now()
        WHERE id = $1
          AND owner_type = 'PROFESSIONAL'
          AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $2)
          AND status = 'PROCESSING' AND deleted_at IS NULL`,
      [mediaId, userId],
    );
  }

  async purgeStale(
    profileId: string,
    olderThan: Date,
  ): Promise<Array<{ s3Key: string; purpose: string }>> {
    const rows = await this.dataSource.query(
      `UPDATE media.files SET deleted_at = now(), updated_at = now()
        WHERE owner_type = 'PROFESSIONAL' AND owner_id = $1
          AND status = 'PROCESSING' AND deleted_at IS NULL
          AND created_at < $2
        RETURNING s3_key, purpose`,
      [profileId, olderThan],
    );
    return (rows ?? []).map(
      (r: { s3_key: string; purpose: string }) => ({
        s3Key: r.s3_key,
        purpose: r.purpose,
      }),
    );
  }

  async countPending(profileId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT count(*)::int AS n
         FROM media.files
        WHERE owner_type = 'PROFESSIONAL' AND owner_id = $1
          AND status = 'PROCESSING' AND deleted_at IS NULL`,
      [profileId],
    );
    return Number(rows[0].n);
  }
}
