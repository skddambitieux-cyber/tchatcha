import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { CreateQuoteCommand, CreateQuoteResult, QuoteRepositoryPort, QuoteView } from '../../application/ports/quote-repository.port';

const SELECT_QUOTE = `SELECT q.id, q.request_id, q.professional_id, q.price,
  q.currency, q.duration_days, q.message, q.status, q.version,
  q.created_at, q.updated_at FROM market.quotes q`;

@Injectable()
export class TypeOrmQuoteRepository implements QuoteRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  async isPublishableProfessional(userId: string): Promise<boolean> {
    const rows = await this.dataSource.query(`SELECT 1 FROM pros.profiles p
      JOIN search.pro_search_docs sd ON sd.professional_id=p.id
      JOIN pros.locations pl ON pl.professional_id=p.id
      WHERE p.user_id=$1 AND search.is_professional_publishable(p.id) LIMIT 1`, [userId]);
    return rows.length > 0;
  }

  async create(userId: string, command: CreateQuoteCommand): Promise<CreateQuoteResult> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const professional = await manager.query(`SELECT p.id FROM pros.profiles p
        JOIN search.pro_search_docs sd ON sd.professional_id=p.id
        JOIN pros.locations pl ON pl.professional_id=p.id
        WHERE p.user_id=$1 AND search.is_professional_publishable(p.id) LIMIT 1`, [userId]);
      if (!professional[0]) return 'NOT_MATCHED';
      const professionalId = professional[0].id as string;
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`quote:${professionalId}:${command.requestId}`]);
      await manager.query(`UPDATE market.service_requests SET status='EXPIRED',
        version=version+1, updated_at=now() WHERE id=$1 AND status IN ('OPEN','QUOTED')
        AND deleted_at IS NULL AND expires_at<=now()`, [command.requestId]);

      const prior = await manager.query(`SELECT id, professional_request_hash
        FROM market.quotes WHERE professional_id=$1 AND professional_idempotency_key=$2`,
        [professionalId, command.idempotencyKey]);
      if (prior[0]) {
        if (prior[0].professional_request_hash !== command.requestHash) return 'IDEMPOTENCY_MISMATCH';
        return this.read(manager, prior[0].id);
      }

      const matched = await manager.query(`SELECT r.currency FROM market.service_requests r
        JOIN pros.profiles p ON p.id=$2
        JOIN search.pro_search_docs sd ON sd.professional_id=p.id
        JOIN pros.locations pl ON pl.professional_id=p.id
        WHERE r.id=$1 AND r.status IN ('OPEN','QUOTED') AND r.deleted_at IS NULL
          AND r.expires_at>now() AND r.country_code=sd.country_code
          AND r.category_id=ANY(sd.category_ids)
          AND ((r.location IS NOT NULL AND ST_DWithin(
                 r.location::geography,sd.location::geography,pl.service_radius_km*1000))
            OR (r.location IS NULL AND r.division_id=pl.division_id))
          AND search.is_professional_publishable(p.id)
        FOR UPDATE OF r`, [command.requestId, professionalId]);
      if (!matched[0]) return 'NOT_MATCHED';

      const active = await manager.query(`SELECT 1 FROM market.quotes
        WHERE request_id=$1 AND professional_id=$2 AND status='PENDING' AND deleted_at IS NULL`,
        [command.requestId, professionalId]);
      if (active[0]) return 'ACTIVE_QUOTE_EXISTS';

      try {
        const inserted = await manager.query(`INSERT INTO market.quotes
          (request_id,professional_id,price,currency,duration_days,message,status,version,
           professional_idempotency_key,professional_request_hash)
          VALUES($1,$2,$3,$4,$5,$6,'PENDING',1,$7,$8) RETURNING id`,
        [command.requestId, professionalId, command.price, matched[0].currency,
          command.durationDays, command.message, command.idempotencyKey, command.requestHash]);
        await manager.query(`UPDATE market.service_requests SET status='QUOTED',
          version=version+1,updated_at=now() WHERE id=$1 AND status='OPEN'`, [command.requestId]);
        return this.read(manager, inserted[0].id);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return 'ACTIVE_QUOTE_EXISTS';
        throw error;
      }
    });
  }

  private async read(manager: EntityManager, id: string): Promise<QuoteView> {
    const rows = await manager.query(`${SELECT_QUOTE} WHERE q.id=$1 AND q.deleted_at IS NULL LIMIT 1`, [id]);
    return toView(rows[0]);
  }
}

function toView(row: Record<string, unknown>): QuoteView {
  return {
    id: String(row.id), request_id: String(row.request_id), professional_id: String(row.professional_id),
    price: Number(row.price), currency: String(row.currency),
    duration_days: row.duration_days == null ? null : Number(row.duration_days),
    message: row.message == null ? null : String(row.message), status: String(row.status), version: Number(row.version),
    created_at: new Date(row.created_at as string).toISOString(), updated_at: new Date(row.updated_at as string).toISOString(),
  };
}
