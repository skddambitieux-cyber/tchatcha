import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { CreateReviewCommand, CreateReviewResult, ReviewRepositoryPort } from '../../application/ports/review-repository.port';
import type { ReviewListView, ReviewView } from '../../interface/http/dto/review.dto';

type Row = Record<string, unknown>;
const toIso = (v: unknown) => new Date(v as string | Date).toISOString();

@Injectable()
export class TypeOrmReviewRepository implements ReviewRepositoryPort {
  constructor(private readonly db: DataSource) {}

  async create(c: CreateReviewCommand): Promise<CreateReviewResult> {
    return this.db.transaction(async (m) => {
      const booking = (await m.query(`SELECT b.id,b.request_id,b.client_id,b.professional_id,b.status,b.client_confirmed_at,b.pro_confirmed_at
        FROM market.bookings b WHERE b.id=$1 FOR UPDATE`, [c.dto.booking_id]))[0] as Row | undefined;
      if (!booking) return 'NOT_FOUND';
      if (String(booking.client_id) !== c.actorId) return 'FORBIDDEN';
      if (String(booking.status) !== 'COMPLETED') return 'INVALID_STATE';

      const prior = (await m.query(`SELECT response_snapshot,request_hash FROM review.reviews WHERE reviewer_id=$1 AND idempotency_key=$2 LIMIT 1`, [c.actorId, c.idempotencyKey]))[0] as Row | undefined;
      if (prior) return String(prior.request_hash) === c.requestHash ? prior.response_snapshot as ReviewView : 'IDEMPOTENCY_MISMATCH';
      const existing = (await m.query(`SELECT 1 FROM review.reviews WHERE booking_id=$1 LIMIT 1`, [c.dto.booking_id]))[0];
      if (existing) return 'ALREADY_EXISTS';

      const mediaIds = c.dto.media_ids ?? [];
      if (mediaIds.length) {
        const media = await m.query(`SELECT id FROM media.files WHERE id=ANY($1::uuid[]) AND owner_type='USER' AND owner_id=$2
          AND status='READY' AND deleted_at IS NULL AND purpose IN ('REVIEW_PHOTO','PORTFOLIO','BEFORE_AFTER') FOR UPDATE`, [mediaIds, c.actorId]);
        if (media.length !== mediaIds.length) return 'MEDIA_INVALID';
      }
      const completionDate = new Date(Math.max(new Date(String(booking.client_confirmed_at)).getTime(), new Date(String(booking.pro_confirmed_at)).getTime()));
      const inserted = (await m.query(`INSERT INTO review.reviews
        (booking_id,request_id,reviewer_id,reviewee_id,rating,punctuality,quality,price_ratio,politeness,comment,status,is_late,idempotency_key,request_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'APPROVED',now()>$11::timestamptz+interval '30 days',$12,$13)
        RETURNING id,created_at,updated_at,is_late,status`, [c.dto.booking_id, booking.request_id, c.actorId, booking.professional_id,
        c.dto.rating, c.dto.punctuality, c.dto.quality, c.dto.price_ratio, c.dto.politeness, c.dto.comment ?? null, completionDate,
        c.idempotencyKey, c.requestHash]))[0] as Row;
      if (mediaIds.length) await m.query(`UPDATE media.files SET owner_type='REVIEW',owner_id=$1,updated_at=now() WHERE id=ANY($2::uuid[])`, [inserted.id, mediaIds]);
      await m.query(`INSERT INTO review.professional_review_stats (professional_id) VALUES($1) ON CONFLICT DO NOTHING`, [booking.professional_id]);
      const stats = (await m.query(`SELECT count(*)::int AS count,avg(rating) AS rating,avg(punctuality) AS punctuality,avg(quality) AS quality,
          avg(price_ratio) AS price_ratio,avg(politeness) AS politeness FROM review.reviews
        WHERE reviewee_id=$1 AND status='APPROVED' AND deleted_at IS NULL`, [booking.professional_id]))[0] as Row;
      await m.query(`UPDATE review.professional_review_stats SET rating_avg=$2,punctuality_avg=$3,quality_avg=$4,price_ratio_avg=$5,politeness_avg=$6,updated_at=now() WHERE professional_id=$1`,
        [booking.professional_id, stats.rating, stats.punctuality, stats.quality, stats.price_ratio, stats.politeness]);
      await m.query(`UPDATE pros.profiles SET rating_avg=COALESCE($2::numeric,0),rating_count=$3::int,updated_at=now() WHERE id=$1`, [booking.professional_id, stats.rating, stats.count]);
      const view = this.toView({ ...inserted, booking_id: booking.id, rating: c.dto.rating, punctuality: c.dto.punctuality, quality: c.dto.quality,
        price_ratio: c.dto.price_ratio, politeness: c.dto.politeness, comment: c.dto.comment ?? null, media_ids: mediaIds });
      await m.query(`UPDATE review.reviews SET response_snapshot=$1::jsonb WHERE id=$2`, [JSON.stringify(view), inserted.id]);
      return view;
    });
  }

  async list(professionalId: string, limit: number, cursor?: string): Promise<ReviewListView | null> {
    const exists = (await this.db.query(`SELECT 1 FROM pros.profiles WHERE id=$1 AND deleted_at IS NULL`, [professionalId]))[0];
    if (!exists) return null;
    let decoded: { created_at: string; id: string } | undefined;
    if (cursor) { try { decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { decoded = undefined; } }
    const params: unknown[] = [professionalId];
    const cursorSql = decoded ? `AND (r.created_at,r.id)<($${params.push(decoded.created_at)},$${params.push(decoded.id)}::uuid)` : '';
    params.push(limit + 1);
    const rows = await this.db.query(`SELECT r.*,COALESCE(array_agg(m.id) FILTER (WHERE m.id IS NOT NULL),'{}') AS media_ids
      FROM review.reviews r LEFT JOIN media.files m ON m.owner_type='REVIEW' AND m.owner_id=r.id AND m.deleted_at IS NULL
      WHERE r.reviewee_id=$1 AND r.status='APPROVED' AND r.deleted_at IS NULL ${cursorSql}
      GROUP BY r.id ORDER BY r.created_at DESC,r.id DESC LIMIT $${params.length}`, params) as Row[];
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((r) => this.toPublicView(r));
    const stats = (await this.db.query(`SELECT count(r.id)::int AS count,s.rating_avg,s.punctuality_avg,s.quality_avg,s.price_ratio_avg,s.politeness_avg
      FROM review.professional_review_stats s LEFT JOIN review.reviews r ON r.reviewee_id=s.professional_id AND r.status='APPROVED' AND r.deleted_at IS NULL
      WHERE s.professional_id=$1 GROUP BY s.professional_id`, [professionalId]))[0] as Row | undefined;
    const last = rows[limit - 1];
    return { data, pagination: { next_cursor: hasMore && last ? Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id })).toString('base64url') : null, has_more: hasMore, total_estimate: null },
      averages: { rating: this.num(stats?.rating_avg), punctuality: this.num(stats?.punctuality_avg), quality: this.num(stats?.quality_avg), price_ratio: this.num(stats?.price_ratio_avg), politeness: this.num(stats?.politeness_avg), count: Number(stats?.review_count ?? 0) } };
  }

  private num(v: unknown): number | null { return v == null ? null : Math.round(Number(v) * 10) / 10; }
  private toView(r: Row): ReviewView { return { id: String(r.id), booking_id: String(r.booking_id), rating: Number(r.rating), punctuality: Number(r.punctuality), quality: Number(r.quality), price_ratio: Number(r.price_ratio), politeness: Number(r.politeness), comment: r.comment == null ? null : String(r.comment), media_ids: Array.isArray(r.media_ids) ? r.media_ids.map(String) : [], is_late: Boolean(r.is_late), status: String(r.status), created_at: toIso(r.created_at), updated_at: toIso(r.updated_at) }; }
  private toPublicView(r: Row) { const v = this.toView(r); return { id: v.id, rating: v.rating, punctuality: v.punctuality, quality: v.quality, price_ratio: v.price_ratio, politeness: v.politeness, comment: v.comment, media_ids: v.media_ids, is_late: v.is_late, created_at: v.created_at }; }
}
