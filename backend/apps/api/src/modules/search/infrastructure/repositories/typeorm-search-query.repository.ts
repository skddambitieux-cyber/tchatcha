import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SearchCriteria,
  SearchPageRow,
  SearchQueryPort,
} from '../../application/ports/search-query.port';

@Injectable()
export class TypeOrmSearchQueryRepository implements SearchQueryPort {
  constructor(private readonly dataSource: DataSource) {}

  async search(criteria: SearchCriteria): Promise<SearchPageRow[]> {
    const params: unknown[] = [];
    const bind = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const where = [
      `sd.country_code = ${bind(criteria.countryCode)}`,
      `sd.status = 'ACTIVE'`,
      `search.is_professional_publishable(sd.professional_id)`,
    ];

    let pointSql = 'NULL::geography';
    if (criteria.lat != null && criteria.lon != null) {
      const lon = bind(criteria.lon);
      const lat = bind(criteria.lat);
      pointSql = `ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;
    }
    if (criteria.q) {
      const q = bind(criteria.q);
      where.push(`(
        sd.name_search @@ plainto_tsquery('simple', unaccent(${q}))
        OR word_similarity(unaccent(${q}), sd.name_trgm) >= 0.3
        OR sd.name_trgm ILIKE '%' || unaccent(${q}) || '%'
      )`);
    }
    if (criteria.categoryId) {
      where.push(`${bind(criteria.categoryId)}::uuid = ANY(sd.category_ids)`);
    }
    if (criteria.divisionId) where.push(`sd.division_id = ${bind(criteria.divisionId)}::uuid`);
    if (criteria.verified != null) where.push(`sd.verified = ${bind(criteria.verified)}`);
    if (criteria.minRating != null) where.push(`sd.rating_avg >= ${bind(criteria.minRating)}`);
    if (criteria.minPrice != null) where.push(`sd.min_price >= ${bind(criteria.minPrice)}`);
    if (criteria.maxPrice != null) where.push(`sd.min_price <= ${bind(criteria.maxPrice)}`);
    if (criteria.radiusKm != null) {
      where.push(`ST_DWithin(sd.location::geography, ${pointSql}, ${bind(criteria.radiusKm * 1000)})`);
    }

    const qScore = criteria.q ? bind(criteria.q) : null;
    const relevanceSql = qScore
      ? `ROUND(GREATEST(
          ts_rank(sd.name_search, plainto_tsquery('simple', unaccent(${qScore}))),
          word_similarity(unaccent(${qScore}), sd.name_trgm)
        )::numeric, 6)`
      : `0::numeric`;
    const distanceSql = criteria.lat != null
      ? `ROUND(ST_Distance(sd.location::geography, ${pointSql})::numeric, 3)`
      : `NULL::numeric`;

    const cursorWhere = this.cursorClause(criteria, bind);
    const orderBy = this.orderBy(criteria.sort);
    const limit = bind(criteria.limit + 1);
    const rows = await this.dataSource.query(
      `WITH ranked AS (
        SELECT sd.professional_id AS id,
               p.business_name, p.headline, sd.verified, sd.rating_avg,
               p.rating_count, p.completed_jobs, sd.min_price, p.currency,
               d.id AS commune_id, d.name AS commune_name,
               ${distanceSql} AS distance_m,
               ${relevanceSql} AS relevance_score,
               svc.id AS service_id, svc.title AS service_title,
               svc.category_id, svc.category_name, svc.category_slug,
               img.url AS image_url
          FROM search.pro_search_docs sd
          JOIN pros.profiles p ON p.id = sd.professional_id
          LEFT JOIN geo.divisions d ON d.id = sd.division_id AND d.active = true
          LEFT JOIN LATERAL (
            SELECT s.id, s.title, s.category_id, c.name AS category_name,
                   c.slug AS category_slug
              FROM pros.services s
              LEFT JOIN pros.categories c ON c.id = s.category_id
             WHERE s.professional_id = sd.professional_id
               AND s.deleted_at IS NULL
               AND (c.id IS NULL OR (c.active = true AND c.deleted_at IS NULL))
             ORDER BY s.is_primary DESC, s.sort_order, s.created_at, s.id
             LIMIT 1
          ) svc ON true
          LEFT JOIN LATERAL (
            SELECT m.url
              FROM media.files m
             WHERE m.owner_type = 'PROFESSIONAL'
               AND m.owner_id = sd.professional_id
               AND m.purpose IN ('PORTFOLIO', 'BEFORE_AFTER')
               AND m.status = 'READY' AND m.deleted_at IS NULL
             ORDER BY m.sort_order, m.created_at, m.id
             LIMIT 1
          ) img ON true
         WHERE ${where.join('\n AND ')})
       SELECT * FROM ranked
       ${cursorWhere ? `WHERE ${cursorWhere}` : ''}
       ORDER BY ${orderBy}
       LIMIT ${limit}`,
      params,
    );

    return rows.map((row: Record<string, unknown>) => {
      const rating = Number(row.rating_avg);
      const ratingCount = Number(row.rating_count);
      const minPrice = row.min_price == null ? null : Number(row.min_price);
      const distance = row.distance_m == null ? null : Number(row.distance_m);
      const relevance = Number(row.relevance_score);
      const primary = criteria.sort === 'relevance'
        ? relevance
        : criteria.sort === 'distance'
          ? distance
          : criteria.sort === 'rating'
            ? rating
            : minPrice;
      const secondary = criteria.sort === 'rating' ? ratingCount : rating;
      return {
        item: {
          id: String(row.id),
          business_name: row.business_name as string | null,
          headline: row.headline as string | null,
          verified: Boolean(row.verified),
          rating_avg: rating,
          rating_count: ratingCount,
          completed_jobs: Number(row.completed_jobs),
          min_price: minPrice,
          currency: String(row.currency),
          commune: row.commune_id
            ? { id: String(row.commune_id), name: String(row.commune_name) }
            : null,
          distance_km: distance == null ? null : Math.round(distance / 100) / 10,
          primary_service: row.service_id
            ? {
                id: String(row.service_id),
                title: String(row.service_title),
                category: row.category_id
                  ? {
                      id: String(row.category_id),
                      name: String(row.category_name),
                      slug: String(row.category_slug),
                    }
                  : null,
              }
            : null,
          image_url: row.image_url as string | null,
        },
        cursor: { sort: criteria.sort, primary, secondary, id: String(row.id) },
      };
    });
  }

  private cursorClause(criteria: SearchCriteria, bind: (value: unknown) => string): string {
    const cursor = criteria.cursor;
    if (!cursor) return '';
    const id = `${bind(cursor.id)}::uuid`;
    const secondary = bind(cursor.secondary);
    if (criteria.sort === 'price' && cursor.primary === null) {
      return `(min_price IS NULL AND (rating_avg < ${secondary}
        OR (rating_avg = ${secondary} AND id > ${id})))`;
    }
    const primary = bind(cursor.primary);
    const column = criteria.sort === 'relevance'
      ? 'relevance_score'
      : criteria.sort === 'distance'
        ? 'distance_m'
        : criteria.sort === 'rating'
          ? 'rating_avg'
          : 'min_price';
    const secondaryColumn = criteria.sort === 'rating' ? 'rating_count' : 'rating_avg';
    const direction = criteria.sort === 'distance' || criteria.sort === 'price' ? '>' : '<';
    const nullTail = criteria.sort === 'price' ? ' OR min_price IS NULL' : '';
    return `((${column} ${direction} ${primary})
      OR (${column} = ${primary} AND ${secondaryColumn} < ${secondary})
      OR (${column} = ${primary} AND ${secondaryColumn} = ${secondary} AND id > ${id})
      ${nullTail})`;
  }

  private orderBy(sort: SearchCriteria['sort']): string {
    if (sort === 'relevance') return 'relevance_score DESC, rating_avg DESC, id ASC';
    if (sort === 'distance') return 'distance_m ASC, rating_avg DESC, id ASC';
    if (sort === 'price') return 'min_price ASC NULLS LAST, rating_avg DESC, id ASC';
    return 'rating_avg DESC, rating_count DESC, id ASC';
  }
}
