import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { PublishRequestCommand, RequestRepositoryPort, RequestView } from '../../application/ports/request-repository.port';

const SELECT_VIEW = `SELECT r.id, r.category_id, c.name AS category_name,
  r.title, r.description, r.country_code, r.division_id, d.name AS division_name,
  CASE WHEN r.location IS NULL THEN NULL ELSE ST_Y(r.location) END AS lat,
  CASE WHEN r.location IS NULL THEN NULL ELSE ST_X(r.location) END AS lon,
  r.budget_min, r.budget_max, r.currency, r.desired_date, r.urgency, r.status,
  r.expires_at, r.cancel_reason, r.version, r.created_at, r.updated_at
  FROM market.service_requests r
  JOIN pros.categories c ON c.id = r.category_id
  LEFT JOIN geo.divisions d ON d.id = r.division_id`;

@Injectable()
export class TypeOrmRequestRepository implements RequestRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  async isActiveClient(userId: string): Promise<boolean> {
    const rows = await this.dataSource.query(`SELECT 1 FROM users.users u
      WHERE u.id = $1 AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
        AND u.anonymized_at IS NULL AND EXISTS (
          SELECT 1 FROM users.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'CLIENT')`, [userId]);
    return rows.length > 0;
  }

  async publish(userId: string, cmd: PublishRequestCommand): Promise<RequestView | 'IDEMPOTENCY_MISMATCH'> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`${userId}:${cmd.idempotencyKey}`]);
      const prior = await manager.query(`SELECT id, client_request_hash
        FROM market.service_requests WHERE client_id = $1 AND client_idempotency_key = $2`,
        [userId, cmd.idempotencyKey]);
      if (prior[0]) {
        if (prior[0].client_request_hash !== cmd.requestHash) return 'IDEMPOTENCY_MISMATCH';
        return this.readMine(manager, userId, prior[0].id);
      }
      const context = await manager.query(`SELECT d.country_code, co.currency
        FROM geo.divisions d JOIN geo.countries co ON co.code = d.country_code
        WHERE d.id = $1 AND d.active = true AND co.active = true`, [cmd.divisionId]);
      if (!context[0]) throw this.invalid('division_not_found');
      const category = await manager.query(`SELECT c.id FROM pros.categories c
        WHERE c.id = $1 AND c.country_code = $2 AND c.active = true
          AND c.deleted_at IS NULL AND c.parent_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM pros.categories child
            WHERE child.parent_id = c.id AND child.active = true AND child.deleted_at IS NULL)`,
        [cmd.categoryId, context[0].country_code]);
      if (!category[0]) throw this.invalid('category_not_assignable');
      let inserted;
      try {
        inserted = await manager.query(`INSERT INTO market.service_requests
          (client_id, category_id, title, description, country_code, division_id,
           location, budget_min, budget_max, currency, desired_date, urgency,
           status, expires_at, version, client_idempotency_key, client_request_hash)
          VALUES ($1,$2,$3,$4,$5,$6,
            CASE WHEN $7::double precision IS NULL THEN NULL
              ELSE ST_SetSRID(ST_MakePoint($8,$7),4326) END,
            $9,$10,$11,$12,$13,'OPEN',now() + interval '48 hours',1,$14,$15)
          RETURNING id`, [userId, cmd.categoryId, cmd.title, cmd.description,
          context[0].country_code, cmd.divisionId, cmd.lat, cmd.lon,
          cmd.budgetMin, cmd.budgetMax, context[0].currency, cmd.desiredDate,
          cmd.urgency, cmd.idempotencyKey, cmd.requestHash]);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          const raced = await manager.query(`SELECT id, client_request_hash
            FROM market.service_requests WHERE client_id=$1 AND client_idempotency_key=$2`,
            [userId, cmd.idempotencyKey]);
          if (raced[0]?.client_request_hash !== cmd.requestHash) return 'IDEMPOTENCY_MISMATCH';
          return this.readMine(manager, userId, raced[0].id);
        }
        throw error;
      }
      return this.readMine(manager, userId, inserted[0].id);
    });
  }

  async listMine(userId: string, limit: number, cursor?: { createdAt: string; id: string }): Promise<RequestView[]> {
    await this.expireMine(userId);
    const params: unknown[] = [userId];
    let cursorSql = '';
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      cursorSql = `AND (r.created_at, r.id) < ($2::timestamptz, $3::uuid)`;
    }
    params.push(limit);
    const rows = await this.dataSource.query(`${SELECT_VIEW}
      WHERE r.client_id=$1 AND r.deleted_at IS NULL ${cursorSql}
      ORDER BY r.created_at DESC, r.id DESC LIMIT $${params.length}`, params);
    return rows.map(toView);
  }

  async findMine(userId: string, requestId: string): Promise<RequestView | null> {
    await this.expireOne(userId, requestId);
    return this.readMine(this.dataSource.manager, userId, requestId);
  }

  async cancel(userId: string, requestId: string, reason: string, version: number) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`UPDATE market.service_requests SET status='EXPIRED',
        version=version+1, updated_at=now() WHERE id=$1 AND client_id=$2
        AND status='OPEN' AND expires_at <= now()`, [requestId, userId]);
      const current = await manager.query(`SELECT status, version FROM market.service_requests
        WHERE id=$1 AND client_id=$2 AND deleted_at IS NULL FOR UPDATE`, [requestId, userId]);
      if (!current[0]) return 'NOT_FOUND' as const;
      if (Number(current[0].version) !== version) return 'VERSION_CONFLICT' as const;
      if (current[0].status !== 'OPEN') return 'ILLEGAL_TRANSITION' as const;
      await manager.query(`UPDATE market.service_requests SET status='CANCELLED',
        canceled_by=$2, cancel_reason=$3, version=version+1, updated_at=now()
        WHERE id=$1`, [requestId, userId, reason]);
      return this.readMine(manager, userId, requestId);
    });
  }

  private async expireMine(userId: string) {
    await this.dataSource.query(`UPDATE market.service_requests SET status='EXPIRED',
      version=version+1, updated_at=now() WHERE client_id=$1 AND status='OPEN'
      AND expires_at <= now()`, [userId]);
  }
  private async expireOne(userId: string, id: string) {
    await this.dataSource.query(`UPDATE market.service_requests SET status='EXPIRED',
      version=version+1, updated_at=now() WHERE id=$1 AND client_id=$2
      AND status='OPEN' AND expires_at <= now()`, [id, userId]);
  }
  private async readMine(executor: EntityManager, userId: string, id: string): Promise<RequestView | null> {
    const rows = await executor.query(`${SELECT_VIEW}
      WHERE r.id=$1 AND r.client_id=$2 AND r.deleted_at IS NULL LIMIT 1`, [id, userId]);
    return rows[0] ? toView(rows[0]) : null;
  }
  private invalid(code: string) { return Object.assign(new Error(code), { code, httpStatus: 422 }); }
}

function toView(row: Record<string, unknown>): RequestView {
  return {
    id: String(row.id), category_id: String(row.category_id), category_name: String(row.category_name),
    title: String(row.title), description: String(row.description), country_code: String(row.country_code),
    division_id: row.division_id ? String(row.division_id) : null,
    division_name: row.division_name ? String(row.division_name) : null,
    lat: row.lat == null ? null : Number(row.lat), lon: row.lon == null ? null : Number(row.lon),
    budget_min: row.budget_min == null ? null : Number(row.budget_min),
    budget_max: row.budget_max == null ? null : Number(row.budget_max), currency: String(row.currency),
    desired_date: row.desired_date ? new Date(row.desired_date as string).toISOString() : null,
    urgency: String(row.urgency), status: String(row.status), expires_at: new Date(row.expires_at as string).toISOString(),
    cancel_reason: row.cancel_reason ? String(row.cancel_reason) : null, version: Number(row.version),
    created_at: new Date(row.created_at as string).toISOString(), updated_at: new Date(row.updated_at as string).toISOString(),
  };
}
