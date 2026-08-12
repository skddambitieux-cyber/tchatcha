import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { MatchedRequestRepositoryPort, MatchedRequestView } from '../../application/ports/matched-request-repository.port';

const MATCHED_SELECT = `SELECT r.id, r.category_id, c.name AS category_name, c.slug AS category_slug,
  r.title, r.description, r.country_code, r.division_id, d.name AS division_name,
  CASE WHEN r.location IS NULL THEN NULL
    ELSE ROUND((ST_Distance(r.location::geography, pro.location::geography) / 1000)::numeric, 1)
  END AS distance_km,
  r.budget_min, r.budget_max, r.currency, r.desired_date, r.urgency,
  r.expires_at, r.created_at
  FROM market.service_requests r
  JOIN pros.categories c ON c.id = r.category_id
  LEFT JOIN geo.divisions d ON d.id = r.division_id
  CROSS JOIN LATERAL (
    SELECT sd.country_code, sd.category_ids, sd.location,
           pl.division_id, pl.service_radius_km
      FROM pros.profiles p
      JOIN search.pro_search_docs sd ON sd.professional_id = p.id
      JOIN pros.locations pl ON pl.professional_id = p.id
     WHERE p.user_id = $1 AND search.is_professional_publishable(p.id)
     LIMIT 1
  ) pro
  WHERE r.status = 'OPEN' AND r.deleted_at IS NULL AND r.expires_at > now()
    AND r.country_code = pro.country_code
    AND r.category_id = ANY(pro.category_ids)
    AND ((r.location IS NOT NULL AND ST_DWithin(
           r.location::geography, pro.location::geography, pro.service_radius_km * 1000))
      OR (r.location IS NULL AND r.division_id = pro.division_id))`;

@Injectable()
export class TypeOrmMatchedRequestRepository implements MatchedRequestRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  async isPublishableProfessional(userId: string): Promise<boolean> {
    const rows = await this.dataSource.query(`SELECT 1
      FROM pros.profiles p
      JOIN search.pro_search_docs sd ON sd.professional_id = p.id
      JOIN pros.locations pl ON pl.professional_id = p.id
      WHERE p.user_id = $1 AND search.is_professional_publishable(p.id)
      LIMIT 1`, [userId]);
    return rows.length > 0;
  }

  async listMatched(userId: string, limit: number, cursor?: { createdAt: string; id: string }): Promise<MatchedRequestView[]> {
    await this.expireOpenRequests();
    const params: unknown[] = [userId];
    let cursorSql = '';
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      cursorSql = `AND (r.created_at, r.id) < ($2::timestamptz, $3::uuid)`;
    }
    params.push(limit);
    const rows = await this.dataSource.query(`${MATCHED_SELECT} ${cursorSql}
      ORDER BY r.created_at DESC, r.id DESC LIMIT $${params.length}`, params);
    return rows.map(toMatchedView);
  }

  async findMatched(userId: string, requestId: string): Promise<MatchedRequestView | null> {
    await this.expireOpenRequests();
    const rows = await this.dataSource.query(`${MATCHED_SELECT} AND r.id = $2::uuid LIMIT 1`, [userId, requestId]);
    return rows[0] ? toMatchedView(rows[0]) : null;
  }

  private async expireOpenRequests() {
    await this.dataSource.query(`UPDATE market.service_requests
      SET status='EXPIRED', version=version+1, updated_at=now()
      WHERE status='OPEN' AND deleted_at IS NULL AND expires_at <= now()`);
  }
}

function toMatchedView(row: Record<string, unknown>): MatchedRequestView {
  return {
    id: String(row.id),
    category: { id: String(row.category_id), name: String(row.category_name), slug: String(row.category_slug) },
    title: String(row.title), description: String(row.description), country_code: String(row.country_code),
    commune: row.division_id ? { id: String(row.division_id), name: String(row.division_name) } : null,
    distance_km: row.distance_km == null ? null : Number(row.distance_km),
    budget_min: row.budget_min == null ? null : Number(row.budget_min),
    budget_max: row.budget_max == null ? null : Number(row.budget_max), currency: String(row.currency),
    desired_date: row.desired_date ? new Date(row.desired_date as string).toISOString() : null,
    urgency: String(row.urgency), expires_at: new Date(row.expires_at as string).toISOString(),
    created_at: new Date(row.created_at as string).toISOString(),
  };
}
