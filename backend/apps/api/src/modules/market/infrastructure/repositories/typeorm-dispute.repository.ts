import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DisputeRepositoryPort, DisputeView, OpenDisputeCommand, OpenDisputeResult } from '../../application/ports/dispute-repository.port';

type Row = Record<string, unknown>;

@Injectable()
export class TypeOrmDisputeRepository implements DisputeRepositoryPort {
  constructor(private readonly db: DataSource) {}

  async open(c: OpenDisputeCommand): Promise<OpenDisputeResult> {
    return this.db.transaction(async (m) => {
      const booking = (await m.query(`SELECT b.id,b.status,b.client_id,b.professional_id,
          EXISTS(SELECT 1 FROM users.user_roles ur WHERE ur.user_id=$2 AND ur.role='ADMIN') AS is_admin,
          EXISTS(SELECT 1 FROM pros.profiles p WHERE p.id=b.professional_id AND p.user_id=$2) AS is_pro
        FROM market.bookings b WHERE b.id=$1 FOR UPDATE`, [c.dto.booking_id, c.actorId]))[0] as Row | undefined;
      if (!booking) return 'NOT_FOUND';
      const participant = String(booking.client_id) === c.actorId || Boolean(booking.is_pro);
      if (Boolean(booking.is_admin) || !participant) return 'FORBIDDEN';

      const prior = (await m.query(`SELECT response_snapshot,request_hash FROM market.disputes
        WHERE opened_by=$1 AND idempotency_key=$2 LIMIT 1`, [c.actorId, c.idempotencyKey]))[0] as Row | undefined;
      if (prior) {
        if (String(prior.request_hash) !== c.requestHash) return 'IDEMPOTENCY_MISMATCH';
        return prior.response_snapshot as DisputeView;
      }
      const active = (await m.query(`SELECT 1 FROM market.disputes
        WHERE booking_id=$1 AND status IN ('OPEN','UNDER_REVIEW') LIMIT 1`, [c.dto.booking_id]))[0];
      if (active) return 'ALREADY_OPEN';
      if (booking.status !== 'IN_PROGRESS') return 'INVALID_STATE';
      const succeeded = (await m.query(`SELECT t.id FROM pay.transactions t
        WHERE t.booking_id=$1 AND t.type='SERVICE_PAYMENT' AND t.status='SUCCEEDED' LIMIT 1`, [c.dto.booking_id]))[0];
      if (!succeeded) return 'INVALID_STATE';
      const pending = (await m.query(`SELECT 1 FROM pay.provider_operations o
        WHERE o.transaction_id=$1 AND o.operation_type='PAYOUT' AND o.status='PENDING' LIMIT 1`, [succeeded.id]))[0];
      if (pending) return 'COMPLETION_IN_PROGRESS';
      const succeededPayout = (await m.query(`SELECT 1 FROM pay.provider_operations o
        WHERE o.transaction_id=$1 AND o.operation_type='PAYOUT' AND o.status='SUCCEEDED' LIMIT 1`, [succeeded.id]))[0];
      if (succeededPayout) return 'INVALID_STATE';
      if (c.dto.media_ids?.length) {
        const rows = await m.query(`SELECT id FROM media.files WHERE id = ANY($1::uuid[])
          AND status='READY' AND deleted_at IS NULL AND owner_type='PROFESSIONAL'
          AND owner_id=$2`, [c.dto.media_ids, booking.professional_id]);
        if (rows.length !== c.dto.media_ids.length) return 'MEDIA_INVALID';
      }
      const normalized = { booking_id: c.dto.booking_id, reason: c.dto.reason,
        description: c.dto.description.trim(), media_ids: c.dto.media_ids ?? [] };
      try {
        const inserted = (await m.query(`INSERT INTO market.disputes
          (booking_id,opened_by,reason,description,media_ids,status,idempotency_key,request_hash)
          VALUES($1,$2,$3,$4,$5,'OPEN',$6,$7) RETURNING id,created_at,updated_at`,
          [normalized.booking_id, c.actorId, normalized.reason, normalized.description,
            normalized.media_ids, c.idempotencyKey, c.requestHash]))[0] as Row;
        await m.query(`UPDATE market.bookings SET status='DISPUTED',version=version+1,updated_at=now()
          WHERE id=$1 AND status='IN_PROGRESS'`, [c.dto.booking_id]);
        const view = this.toView({ ...normalized, ...inserted, opened_by: c.actorId, status: 'OPEN' });
        await m.query(`UPDATE market.disputes SET response_snapshot=$1::jsonb WHERE id=$2`, [JSON.stringify(view), inserted.id]);
        return view;
      } catch (e) {
        if ((e as { code?: string }).code === '23505') {
          const same = (await m.query(`SELECT response_snapshot,request_hash FROM market.disputes WHERE opened_by=$1 AND idempotency_key=$2`, [c.actorId, c.idempotencyKey]))[0] as Row | undefined;
          if (same && String(same.request_hash) === c.requestHash) return same.response_snapshot as DisputeView;
          return 'ALREADY_OPEN';
        }
        throw e;
      }
    });
  }

  async findVisible(id: string, actorId: string): Promise<DisputeView | 'FORBIDDEN' | null> {
    const rows = await this.db.query(`SELECT d.*,b.client_id,b.professional_id,
      EXISTS(SELECT 1 FROM users.user_roles ur WHERE ur.user_id=$2 AND ur.role='ADMIN') AS is_admin,
      EXISTS(SELECT 1 FROM pros.profiles p WHERE p.id=b.professional_id AND p.user_id=$2) AS is_pro
      FROM market.disputes d JOIN market.bookings b ON b.id=d.booking_id WHERE d.id=$1`, [id, actorId]);
    const row = rows[0] as Row | undefined;
    if (!row) return null;
    if (row.is_admin !== true && String(row.client_id) !== actorId && row.is_pro !== true) return 'FORBIDDEN';
    return this.toView(row);
  }

  private toView(row: Row): DisputeView {
    return { id: String(row.id), booking_id: String(row.booking_id), opened_by: String(row.opened_by),
      reason: String(row.reason), description: String(row.description ?? ''),
      media_ids: Array.isArray(row.media_ids) ? row.media_ids.map(String) : [], status: String(row.status),
      created_at: new Date(row.created_at as string | Date).toISOString(),
      updated_at: new Date(row.updated_at as string | Date).toISOString() };
  }
}
