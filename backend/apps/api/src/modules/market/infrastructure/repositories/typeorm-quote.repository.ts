import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { CounterOfferCommand, CreateQuoteCommand, CreateQuoteResult, QuoteDetailView, QuoteRepositoryPort, QuoteView } from '../../application/ports/quote-repository.port';

const SELECT_QUOTE = `SELECT q.id, q.request_id, q.professional_id, q.created_by, p.user_id AS professional_user_id, q.price,
  q.currency, q.duration_days, q.message, q.status, q.version,
  q.created_at, q.updated_at FROM market.quotes q JOIN pros.profiles p ON p.id=q.professional_id`;
const SELECT_DETAIL = `SELECT q.id,q.request_id,q.professional_id,q.price,q.currency,
  q.duration_days,q.message,q.status,q.version,q.created_at,q.updated_at,q.created_by,
  r.title AS request_title,r.urgency AS request_urgency,r.expires_at AS request_expires_at,
  (r.budget_max IS NOT NULL AND q.price>r.budget_max) AS out_of_budget,
  p.business_name,p.headline,p.verified,p.rating_avg,p.rating_count,p.user_id AS professional_user_id
  FROM market.quotes q JOIN market.service_requests r ON r.id=q.request_id
  JOIN pros.profiles p ON p.id=q.professional_id`;

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

  async isActiveProfessional(userId: string): Promise<boolean> {
    const rows = await this.dataSource.query(`SELECT 1 FROM users.users u
      JOIN users.user_roles ur ON ur.user_id=u.id AND ur.role='PROFESSIONAL'
      JOIN pros.profiles p ON p.user_id=u.id
      WHERE u.id=$1 AND u.status='ACTIVE' AND u.deleted_at IS NULL
        AND u.anonymized_at IS NULL AND p.status='ACTIVE' LIMIT 1`, [userId]);
    return rows.length > 0;
  }

  async isActiveClient(userId: string): Promise<boolean> {
    const rows = await this.dataSource.query(`SELECT 1 FROM users.users u
      JOIN users.user_roles ur ON ur.user_id=u.id AND ur.role='CLIENT'
      WHERE u.id=$1 AND u.status='ACTIVE' AND u.deleted_at IS NULL
        AND u.anonymized_at IS NULL LIMIT 1`, [userId]);
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
          (request_id,professional_id,created_by,price,currency,duration_days,message,status,version,
           professional_idempotency_key,professional_request_hash)
          VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING',1,$8,$9) RETURNING id`,
        [command.requestId, professionalId, userId, command.price, matched[0].currency,
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

  async listReceived(userId: string, requestId: string, limit: number,
    cursor?: { createdAt: string; id: string }): Promise<QuoteDetailView[] | 'NOT_FOUND'> {
    await this.expireRequest(requestId);
    const owned = await this.dataSource.query(`SELECT 1 FROM market.service_requests
      WHERE id=$1 AND client_id=$2 AND deleted_at IS NULL`, [requestId, userId]);
    if (!owned[0]) return 'NOT_FOUND';
    const params: unknown[] = [requestId];
    let cursorSql = '';
    if (cursor) { params.push(cursor.createdAt, cursor.id); cursorSql = `AND (q.created_at,q.id)<($2::timestamptz,$3::uuid)`; }
    params.push(limit);
    const rows = await this.dataSource.query(`${SELECT_DETAIL}
      WHERE q.request_id=$1 AND q.deleted_at IS NULL ${cursorSql}
      ORDER BY q.created_at DESC,q.id DESC LIMIT $${params.length}`, params);
    return rows.map(toDetailView);
  }

  async listSent(userId: string, limit: number,
    cursor?: { createdAt: string; id: string }): Promise<QuoteDetailView[]> {
    await this.expireAllRequests();
    const params: unknown[] = [userId];
    let cursorSql = '';
    if (cursor) { params.push(cursor.createdAt, cursor.id); cursorSql = `AND (q.created_at,q.id)<($2::timestamptz,$3::uuid)`; }
    params.push(limit);
    const rows = await this.dataSource.query(`${SELECT_DETAIL}
      WHERE p.user_id=$1 AND q.deleted_at IS NULL ${cursorSql}
      ORDER BY q.created_at DESC,q.id DESC LIMIT $${params.length}`, params);
    return rows.map(toDetailView);
  }

  async findAccessible(userId: string, quoteId: string): Promise<QuoteDetailView | null> {
    await this.expireQuoteRequest(quoteId);
    const rows = await this.dataSource.query(`${SELECT_DETAIL}
      WHERE q.id=$1 AND q.deleted_at IS NULL
        AND (r.client_id=$2 OR p.user_id=$2) LIMIT 1`, [quoteId, userId]);
    return rows[0] ? toDetailView(rows[0]) : null;
  }

  async withdraw(userId: string, quoteId: string, version: number) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`UPDATE market.service_requests r SET status='EXPIRED',version=r.version+1,updated_at=now()
        FROM market.quotes q WHERE q.id=$1 AND q.request_id=r.id AND r.status IN ('OPEN','QUOTED')
          AND r.deleted_at IS NULL AND r.expires_at<=now()`, [quoteId]);
      await manager.query(`UPDATE market.quotes q SET status='WITHDRAWN',version=q.version+1,updated_at=now()
        FROM market.service_requests r WHERE q.id=$1 AND q.request_id=r.id AND r.status='EXPIRED'
          AND q.status='PENDING' AND q.deleted_at IS NULL`, [quoteId]);
      const current = await manager.query(`SELECT q.status,q.version,r.status AS request_status
        FROM market.quotes q JOIN market.service_requests r ON r.id=q.request_id
        JOIN pros.profiles p ON p.id=q.professional_id
        WHERE q.id=$1 AND p.user_id=$2 AND q.deleted_at IS NULL FOR UPDATE OF q,r`, [quoteId, userId]);
      if (!current[0]) return 'NOT_FOUND' as const;
      if (Number(current[0].version) !== version) return 'VERSION_CONFLICT' as const;
      if (current[0].status !== 'PENDING' ||
          !['OPEN', 'QUOTED', 'NEGOTIATING', 'REOPENED'].includes(String(current[0].request_status))) {
        return 'ILLEGAL_TRANSITION' as const;
      }
      await manager.query(`UPDATE market.quotes SET status='WITHDRAWN',version=version+1,updated_at=now()
        WHERE id=$1`, [quoteId]);
      return this.readDetail(manager, quoteId);
    });
  }

  async counter(userId: string, quoteId: string, command: CounterOfferCommand) {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`counter:${quoteId}`]);
      const prior = await manager.query(`SELECT id,actor_request_hash FROM market.quotes
        WHERE created_by=$1 AND actor_idempotency_key=$2`, [userId, command.idempotencyKey]);
      if (prior[0]) {
        if (prior[0].actor_request_hash !== command.requestHash) return 'IDEMPOTENCY_MISMATCH' as const;
        return this.readDetail(manager, prior[0].id);
      }
      const parent = await manager.query(`SELECT q.*,r.client_id,r.status AS request_status,r.expires_at,
          p.user_id AS professional_user_id
        FROM market.quotes q JOIN market.service_requests r ON r.id=q.request_id
        JOIN pros.profiles p ON p.id=q.professional_id
        WHERE q.id=$1 AND q.deleted_at IS NULL AND ($2=r.client_id OR $2=p.user_id)
        FOR UPDATE OF q,r`, [quoteId, userId]);
      if (!parent[0]) return 'NOT_FOUND' as const;
      if (Number(parent[0].version) !== command.version) return 'VERSION_CONFLICT' as const;
      if (parent[0].status !== 'PENDING' || !['QUOTED', 'NEGOTIATING'].includes(String(parent[0].request_status)) ||
          new Date(parent[0].expires_at as string).getTime() <= Date.now()) return 'ILLEGAL_TRANSITION' as const;
      if (parent[0].created_by === userId) return 'SAME_ACTOR' as const;
      const count = await manager.query(`WITH RECURSIVE chain AS (
          SELECT id,parent_quote_id FROM market.quotes WHERE id=$1
          UNION ALL SELECT q.id,q.parent_quote_id FROM market.quotes q JOIN chain c ON q.id=c.parent_quote_id)
        SELECT count(*)::int-1 AS counter_count FROM chain`, [quoteId]);
      if (Number(count[0].counter_count) >= 4) return 'LIMIT_REACHED' as const;
      await manager.query(`UPDATE market.quotes SET status='COUNTERED',version=version+1,updated_at=now() WHERE id=$1`, [quoteId]);
      const inserted = await manager.query(`INSERT INTO market.quotes
        (request_id,professional_id,parent_quote_id,created_by,price,currency,duration_days,message,status,version,
         actor_idempotency_key,actor_request_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',1,$9,$10) RETURNING id`,
      [parent[0].request_id, parent[0].professional_id, quoteId, userId, command.price,
        parent[0].currency, command.durationDays, command.message, command.idempotencyKey, command.requestHash]);
      await manager.query(`UPDATE market.service_requests SET status='NEGOTIATING',version=version+1,updated_at=now()
        WHERE id=$1 AND status='QUOTED'`, [parent[0].request_id]);
      return this.readDetail(manager, inserted[0].id);
    });
  }

  async history(userId: string, quoteId: string): Promise<QuoteDetailView[] | 'NOT_FOUND'> {
    const access = await this.dataSource.query(`SELECT q.id FROM market.quotes q
      JOIN market.service_requests r ON r.id=q.request_id JOIN pros.profiles p ON p.id=q.professional_id
      WHERE q.id=$1 AND q.deleted_at IS NULL AND ($2=r.client_id OR $2=p.user_id)`, [quoteId, userId]);
    if (!access[0]) return 'NOT_FOUND';
    const rows = await this.dataSource.query(`WITH RECURSIVE ancestors AS (
        SELECT id,parent_quote_id FROM market.quotes WHERE id=$1
        UNION ALL SELECT q.id,q.parent_quote_id FROM market.quotes q JOIN ancestors a ON q.id=a.parent_quote_id),
      root AS (SELECT id FROM ancestors WHERE parent_quote_id IS NULL), descendants AS (
        SELECT q.id FROM market.quotes q JOIN root ON q.id=root.id
        UNION ALL SELECT q.id FROM market.quotes q JOIN descendants d ON q.parent_quote_id=d.id)
      ${SELECT_DETAIL} JOIN descendants chain ON chain.id=q.id
      WHERE q.deleted_at IS NULL ORDER BY q.created_at ASC,q.id ASC`, [quoteId]);
    return rows.map(toDetailView);
  }

  private async expireRequest(requestId: string) {
    await this.dataSource.query(`UPDATE market.service_requests SET status='EXPIRED',version=version+1,updated_at=now()
      WHERE id=$1 AND status IN ('OPEN','QUOTED') AND deleted_at IS NULL AND expires_at<=now()`, [requestId]);
    await this.withdrawExpiredQuotes('r.id=$1', [requestId]);
  }
  private async expireQuoteRequest(quoteId: string) {
    await this.dataSource.query(`UPDATE market.service_requests r SET status='EXPIRED',version=r.version+1,updated_at=now()
      FROM market.quotes q WHERE q.id=$1 AND q.request_id=r.id AND r.status IN ('OPEN','QUOTED')
        AND r.deleted_at IS NULL AND r.expires_at<=now()`, [quoteId]);
    await this.withdrawExpiredQuotes('q.id=$1', [quoteId]);
  }
  private async expireAllRequests() {
    await this.dataSource.query(`UPDATE market.service_requests SET status='EXPIRED',version=version+1,updated_at=now()
      WHERE status IN ('OPEN','QUOTED') AND deleted_at IS NULL AND expires_at<=now()`);
    await this.withdrawExpiredQuotes('true', []);
  }
  private async withdrawExpiredQuotes(predicate: string, params: unknown[]) {
    await this.dataSource.query(`UPDATE market.quotes q SET status='WITHDRAWN',version=q.version+1,updated_at=now()
      FROM market.service_requests r WHERE q.request_id=r.id AND r.status='EXPIRED'
        AND q.status='PENDING' AND q.deleted_at IS NULL AND ${predicate}`, params);
  }

  private async read(manager: EntityManager, id: string): Promise<QuoteView> {
    const rows = await manager.query(`${SELECT_QUOTE} WHERE q.id=$1 AND q.deleted_at IS NULL LIMIT 1`, [id]);
    return toView(rows[0]);
  }
  private async readDetail(manager: EntityManager, id: string): Promise<QuoteDetailView> {
    const rows = await manager.query(`${SELECT_DETAIL} WHERE q.id=$1 AND q.deleted_at IS NULL LIMIT 1`, [id]);
    return toDetailView(rows[0]);
  }
}

function toView(row: Record<string, unknown>): QuoteView {
  return {
    id: String(row.id), request_id: String(row.request_id), professional_id: String(row.professional_id),
    price: Number(row.price), currency: String(row.currency),
    duration_days: row.duration_days == null ? null : Number(row.duration_days),
    message: row.message == null ? null : String(row.message), status: String(row.status), version: Number(row.version),
    created_at: new Date(row.created_at as string).toISOString(), updated_at: new Date(row.updated_at as string).toISOString(),
    offered_by: row.created_by === row.professional_user_id ? 'PROFESSIONAL' : 'CLIENT',
  };
}

function toDetailView(row: Record<string, unknown>): QuoteDetailView {
  return {
    ...toView(row), out_of_budget: Boolean(row.out_of_budget),
    request: { id: String(row.request_id), title: String(row.request_title),
      urgency: String(row.request_urgency), expires_at: new Date(row.request_expires_at as string).toISOString() },
    professional: { id: String(row.professional_id),
      business_name: row.business_name == null ? null : String(row.business_name),
      headline: row.headline == null ? null : String(row.headline), verified: Boolean(row.verified),
      rating_avg: Number(row.rating_avg), rating_count: Number(row.rating_count) },
  };
}
