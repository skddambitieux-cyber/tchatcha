import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { CreateReviewCommand, CreateReviewResult, ModerateReviewCommand, ModerateReviewResult, ModerationQueueItem, ReportReviewCommand, ReportReviewResult, RespondReviewCommand, RespondReviewResult, ReviewRepositoryPort, UpdateReviewCommand, UpdateReviewResult } from '../../application/ports/review-repository.port';
import type { ReviewListView, ReviewResponseView, ReviewView } from '../../interface/http/dto/review.dto';

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

  async update(c: UpdateReviewCommand): Promise<UpdateReviewResult> {
    return this.db.transaction(async (m) => {
      const review = (await m.query(`SELECT r.* FROM review.reviews r WHERE r.id=$1 FOR UPDATE`, [c.reviewId]))[0] as Row | undefined;
      if (!review) return 'NOT_FOUND';
      if (String(review.reviewer_id) !== c.actorId) return 'FORBIDDEN';
      if (String(review.status) !== 'APPROVED' || review.deleted_at) return 'INVALID_STATE';
      if (Number(review.edit_count) >= 1) return 'ALREADY_EDITED';
      if (new Date().getTime() > new Date(String(review.created_at)).getTime() + 48 * 60 * 60 * 1000) return 'WINDOW_CLOSED';

      const mediaIds = c.dto.media_ids ?? [];
      if (mediaIds.length) {
        const valid = await m.query(`SELECT id FROM media.files
          WHERE id=ANY($1::uuid[]) AND status='READY' AND deleted_at IS NULL AND purpose IN ('REVIEW_PHOTO','PORTFOLIO','BEFORE_AFTER')
            AND ((owner_type='USER' AND owner_id=$2) OR (owner_type='REVIEW' AND owner_id=$3)) FOR UPDATE`, [mediaIds, c.actorId, c.reviewId]);
        if (valid.length !== mediaIds.length) return 'MEDIA_INVALID';
      }
      const before = await this.currentContent(m, c.reviewId);
      await m.query(`INSERT INTO review.review_edits(review_id,actor_id,before,after)
        VALUES($1,$2,$3::jsonb,$4::jsonb)`, [c.reviewId, c.actorId, JSON.stringify(before), JSON.stringify({ ...c.dto, comment: c.dto.comment ?? null, media_ids: mediaIds })]);
      await m.query(`UPDATE review.reviews SET rating=$2,punctuality=$3,quality=$4,price_ratio=$5,politeness=$6,
        comment=$7,edit_count=1,edited_at=now(),updated_at=now() WHERE id=$1`, [c.reviewId, c.dto.rating, c.dto.punctuality,
        c.dto.quality, c.dto.price_ratio, c.dto.politeness, c.dto.comment ?? null]);
      await m.query(`UPDATE media.files SET deleted_at=now(),updated_at=now() WHERE owner_type='REVIEW' AND owner_id=$1 AND NOT (id=ANY($2::uuid[]))`, [c.reviewId, mediaIds]);
      if (mediaIds.length) await m.query(`UPDATE media.files SET owner_type='REVIEW',owner_id=$1,deleted_at=NULL,updated_at=now() WHERE id=ANY($2::uuid[])`, [c.reviewId, mediaIds]);
      await this.recalculate(m, String(review.reviewee_id));
      const view = this.toView({ ...review, ...c.dto, id: review.id, booking_id: review.booking_id, comment: c.dto.comment ?? null,
        media_ids: mediaIds, edit_count: 1, edited_at: new Date(), updated_at: new Date() });
      await this.audit(m, c.actorId, c.reviewId, 'review.edited', before, { ...c.dto, media_ids: mediaIds });
      await m.query(`UPDATE review.reviews SET response_snapshot=$1::jsonb WHERE id=$2`, [JSON.stringify(view), c.reviewId]);
      return view;
    });
  }

  async respond(c: RespondReviewCommand): Promise<RespondReviewResult> {
    return this.db.transaction(async (m) => {
      const review = (await m.query(`SELECT r.*,p.user_id AS professional_user_id FROM review.reviews r
        JOIN pros.profiles p ON p.id=r.reviewee_id WHERE r.id=$1 FOR UPDATE`, [c.reviewId]))[0] as Row | undefined;
      if (!review) return 'NOT_FOUND';
      if (String(review.professional_user_id) !== c.actorId) return 'FORBIDDEN';
      if (String(review.status) !== 'APPROVED' || review.deleted_at) return 'INVALID_STATE';
      const prior = (await m.query(`SELECT id,review_id,professional_id,body,created_at,request_hash,idempotency_key FROM review.responses
        WHERE review_id=$1 LIMIT 1`, [c.reviewId]))[0] as Row | undefined;
      if (prior) {
        if (String(prior.idempotency_key) !== c.idempotencyKey) return 'ALREADY_EXISTS';
        if (String(prior.request_hash) !== c.requestHash) return 'IDEMPOTENCY_MISMATCH';
        return this.responseView(prior);
      }
      const reused = (await m.query(`SELECT request_hash FROM review.responses WHERE professional_id=$1 AND idempotency_key=$2 LIMIT 1`, [review.reviewee_id, c.idempotencyKey]))[0] as Row | undefined;
      if (reused) return String(reused.request_hash) === c.requestHash ? 'ALREADY_EXISTS' : 'IDEMPOTENCY_MISMATCH';
      const inserted = (await m.query(`INSERT INTO review.responses(review_id,professional_id,body,idempotency_key,request_hash)
        VALUES($1,$2,$3,$4,$5) RETURNING id,review_id,professional_id,body,created_at`, [c.reviewId, review.reviewee_id, c.body, c.idempotencyKey, c.requestHash]))[0] as Row;
      const view = this.responseView(inserted);
      await this.audit(m, c.actorId, c.reviewId, 'review.response_added', null, { body: c.body });
      await m.query(`INSERT INTO audit.events(aggregate_type,aggregate_id,event_type,payload)
        VALUES('Review',$1,'review.response_added',$2::jsonb)`, [c.reviewId, JSON.stringify({ review_id: c.reviewId })]);
      return view;
    });
  }

  async report(c: ReportReviewCommand): Promise<ReportReviewResult> {
    return this.db.transaction(async (m) => {
      const review = (await m.query(`SELECT r.id,r.status,r.reviewer_id,r.reviewee_id,p.user_id AS professional_user_id
        FROM review.reviews r JOIN pros.profiles p ON p.id=r.reviewee_id WHERE r.id=$1 FOR UPDATE`, [c.reviewId]))[0] as Row | undefined;
      if (!review) return 'NOT_FOUND';
      if (String(review.reviewer_id) !== c.actorId && String(review.professional_user_id) !== c.actorId) return 'FORBIDDEN';
      const prior = (await m.query(`SELECT id,review_id,status,created_at,request_hash FROM review.review_flags WHERE review_id=$1 AND flagged_by=$2`, [c.reviewId, c.actorId]))[0] as Row | undefined;
      if (prior) {
        if (prior.request_hash && String(prior.request_hash) !== c.requestHash) return 'IDEMPOTENCY_MISMATCH';
        return { id: String(prior.id), review_id: c.reviewId, status: String(prior.status), created_at: toIso(prior.created_at) };
      }
      const reused = (await m.query(`SELECT request_hash FROM review.review_flags WHERE flagged_by=$1 AND idempotency_key=$2 LIMIT 1`, [c.actorId, c.idempotencyKey]))[0] as Row | undefined;
      if (reused && String(reused.request_hash) !== c.requestHash) return 'IDEMPOTENCY_MISMATCH';
      const inserted = (await m.query(`INSERT INTO review.review_flags(review_id,flagged_by,reason,comment,status,idempotency_key,request_hash)
        VALUES($1,$2,$3,$4,'OPEN',$5,$6) RETURNING id,review_id,status,created_at`, [c.reviewId, c.actorId, c.dto.reason, c.dto.comment ?? null, c.idempotencyKey, c.requestHash]))[0] as Row;
      if (String(review.status) === 'APPROVED') await m.query(`UPDATE review.reviews SET status='FLAGGED',updated_at=now() WHERE id=$1`, [c.reviewId]);
      await m.query(`INSERT INTO admin.validation_tasks(entity_type,entity_id,status,note) VALUES('REVIEW',$1,'OPEN',$2)
        ON CONFLICT DO NOTHING`, [c.reviewId, c.dto.reason]);
      await this.audit(m, c.actorId, c.reviewId, 'review.reported', null, { reason: c.dto.reason });
      return { id: String(inserted.id), review_id: c.reviewId, status: 'OPEN', created_at: toIso(inserted.created_at) };
    });
  }

  async moderate(c: ModerateReviewCommand): Promise<ModerateReviewResult> {
    return this.db.transaction(async (m) => {
      const review = (await m.query(`SELECT r.* FROM review.reviews r WHERE r.id=$1 FOR UPDATE`, [c.reviewId]))[0] as Row | undefined;
      if (!review) return 'NOT_FOUND';
      const media = await m.query(`SELECT id FROM media.files WHERE owner_type='REVIEW' AND owner_id=$1 AND deleted_at IS NULL`, [c.reviewId]);
      review.media_ids = media.map((row) => row.id);
      const target = c.dto.decision === 'HIDE' ? 'REJECTED' : 'APPROVED';
      if (String(review.status) === target) return this.toView(review);
      if (c.dto.decision === 'RESTORE' && !['REJECTED','FLAGGED'].includes(String(review.status))) return 'INVALID_STATE';
      await m.query(`UPDATE review.reviews SET status=$2,moderated_by=$3,moderated_at=now(),updated_at=now() WHERE id=$1`, [c.reviewId, target, c.adminId]);
      await m.query(`UPDATE review.review_flags SET status='RESOLVED',resolved_by=$2,resolved_at=now() WHERE review_id=$1 AND status IN ('OPEN','IN_REVIEW')`, [c.reviewId, c.adminId]);
      await m.query(`UPDATE admin.validation_tasks SET status='COMPLETED',decided_by=$2,decided_at=now(),note=$3,updated_at=now() WHERE entity_type='REVIEW' AND entity_id=$1`, [c.reviewId, c.adminId, c.dto.reason]);
      await this.recalculate(m, String(review.reviewee_id));
      await this.audit(m, c.adminId, c.reviewId, 'review.moderated', { status: review.status }, { status: target, reason: c.dto.reason });
      return this.toView({ ...review, status: target, moderated_by: c.adminId, moderated_at: new Date(), updated_at: new Date() });
    });
  }

  async listModeration(status: string): Promise<ModerationQueueItem[]> {
    const rows = await this.db.query(`SELECT r.id,r.status,r.reviewee_id,r.rating,r.comment,r.created_at,
      count(f.id)::int AS report_count,COALESCE(array_agg(f.reason) FILTER (WHERE f.reason IS NOT NULL),'{}') AS reasons
      FROM review.reviews r LEFT JOIN review.review_flags f ON f.review_id=r.id
      WHERE ($1='OPEN' AND r.status='FLAGGED') OR ($1<>'OPEN' AND f.status=$1)
      GROUP BY r.id ORDER BY r.created_at ASC`, [status]) as Row[];
    return rows.map((r) => ({ id: String(r.id), status: String(r.status), reviewee_id: String(r.reviewee_id), rating: Number(r.rating), comment: r.comment == null ? null : String(r.comment), report_count: Number(r.report_count), reasons: Array.isArray(r.reasons) ? r.reasons.map(String) : [], created_at: toIso(r.created_at) }));
  }

  async list(professionalId: string, limit: number, cursor?: string): Promise<ReviewListView | null> {
    const exists = (await this.db.query(`SELECT 1 FROM pros.profiles WHERE id=$1 AND deleted_at IS NULL`, [professionalId]))[0];
    if (!exists) return null;
    let decoded: { created_at: string; id: string } | undefined;
    if (cursor) { try { decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { decoded = undefined; } }
    const params: unknown[] = [professionalId];
    const cursorSql = decoded ? `AND (r.created_at,r.id)<($${params.push(decoded.created_at)},$${params.push(decoded.id)}::uuid)` : '';
    params.push(limit + 1);
    const rows = await this.db.query(`SELECT r.*,COALESCE(array_agg(m.id) FILTER (WHERE m.id IS NOT NULL),'{}') AS media_ids,
        rr.id AS response_id,rr.body AS response_body,rr.created_at AS response_created_at
      FROM review.reviews r LEFT JOIN media.files m ON m.owner_type='REVIEW' AND m.owner_id=r.id AND m.deleted_at IS NULL
      LEFT JOIN review.responses rr ON rr.review_id=r.id
      WHERE r.reviewee_id=$1 AND r.status='APPROVED' AND r.deleted_at IS NULL ${cursorSql}
      GROUP BY r.id,rr.id,rr.body,rr.created_at ORDER BY r.created_at DESC,r.id DESC LIMIT $${params.length}`, params) as Row[];
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((r) => this.toPublicView(r));
    const stats = (await this.db.query(`SELECT count(r.id)::int AS count,s.rating_avg,s.punctuality_avg,s.quality_avg,s.price_ratio_avg,s.politeness_avg
      FROM review.professional_review_stats s LEFT JOIN review.reviews r ON r.reviewee_id=s.professional_id AND r.status='APPROVED' AND r.deleted_at IS NULL
      WHERE s.professional_id=$1 GROUP BY s.professional_id`, [professionalId]))[0] as Row | undefined;
    const last = rows[limit - 1];
    return { data, pagination: { next_cursor: hasMore && last ? Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id })).toString('base64url') : null, has_more: hasMore, total_estimate: null },
      averages: { rating: this.num(stats?.rating_avg), punctuality: this.num(stats?.punctuality_avg), quality: this.num(stats?.quality_avg), price_ratio: this.num(stats?.price_ratio_avg), politeness: this.num(stats?.politeness_avg), count: Number(stats?.count ?? 0) } };
  }

  private async currentContent(m: { query(sql: string, params?: unknown[]): Promise<Row[]> }, reviewId: string) {
    const row = (await m.query(`SELECT r.rating,r.punctuality,r.quality,r.price_ratio,r.politeness,r.comment,
      COALESCE(array_agg(f.id) FILTER (WHERE f.id IS NOT NULL),'{}') AS media_ids
      FROM review.reviews r LEFT JOIN media.files f ON f.owner_type='REVIEW' AND f.owner_id=r.id AND f.deleted_at IS NULL
      WHERE r.id=$1 GROUP BY r.id`, [reviewId]))[0] as Row;
    return { rating: Number(row.rating), punctuality: Number(row.punctuality), quality: Number(row.quality), price_ratio: Number(row.price_ratio), politeness: Number(row.politeness), comment: row.comment == null ? null : String(row.comment), media_ids: Array.isArray(row.media_ids) ? row.media_ids.map(String) : [] };
  }

  private async recalculate(m: { query(sql: string, params?: unknown[]): Promise<Row[]> }, professionalId: string) {
    await m.query(`INSERT INTO review.professional_review_stats(professional_id) VALUES($1) ON CONFLICT DO NOTHING`, [professionalId]);
    const stats = (await m.query(`SELECT count(*)::int AS count,avg(rating) AS rating,avg(punctuality) AS punctuality,avg(quality) AS quality,
      avg(price_ratio) AS price_ratio,avg(politeness) AS politeness FROM review.reviews
      WHERE reviewee_id=$1 AND status='APPROVED' AND deleted_at IS NULL`, [professionalId]))[0] as Row;
    await m.query(`UPDATE review.professional_review_stats SET rating_avg=$2,punctuality_avg=$3,quality_avg=$4,price_ratio_avg=$5,politeness_avg=$6,updated_at=now() WHERE professional_id=$1`,
      [professionalId, stats.rating, stats.punctuality, stats.quality, stats.price_ratio, stats.politeness]);
    await m.query(`UPDATE pros.profiles SET rating_avg=COALESCE($2::numeric,0),rating_count=$3::int,updated_at=now() WHERE id=$1`, [professionalId, stats.rating, stats.count]);
  }

  private async audit(m: { query(sql: string, params?: unknown[]): Promise<Row[]> }, actorId: string, reviewId: string, eventType: string, before: unknown, after: unknown) {
    await m.query(`INSERT INTO audit.logs(actor_id,action,entity_type,entity_id,before,after)
      VALUES($1,$2,'REVIEW',$3,$4::jsonb,$5::jsonb)`, [actorId, eventType, reviewId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
    const version = (await m.query(`SELECT COALESCE(max(version),0)+1 AS version FROM audit.aggregate_events WHERE aggregate_type='Review' AND aggregate_id=$1`, [reviewId]))[0].version;
    await m.query(`INSERT INTO audit.aggregate_events(aggregate_type,aggregate_id,version,event_type,payload,actor_id)
      VALUES('Review',$1,$2,$3,$4::jsonb,$5)`, [reviewId, version, eventType, JSON.stringify({ before, after }), actorId]);
    await m.query(`INSERT INTO audit.events(aggregate_type,aggregate_id,event_type,payload)
      VALUES('Review',$1,$2,$3::jsonb)`, [reviewId, eventType, JSON.stringify({ review_id: reviewId })]);
  }

  private num(v: unknown): number | null { return v == null ? null : Math.round(Number(v) * 10) / 10; }
  private responseView(r: Row): ReviewResponseView { return { id: String(r.id), review_id: String(r.review_id), body: String(r.body), created_at: toIso(r.created_at) }; }
  private toView(r: Row): ReviewView { return { id: String(r.id), booking_id: String(r.booking_id), rating: Number(r.rating), punctuality: Number(r.punctuality), quality: Number(r.quality), price_ratio: Number(r.price_ratio), politeness: Number(r.politeness), comment: r.comment == null ? null : String(r.comment), media_ids: Array.isArray(r.media_ids) ? r.media_ids.map(String) : [], is_late: Boolean(r.is_late), status: String(r.status), created_at: toIso(r.created_at), updated_at: toIso(r.updated_at) }; }
  private toPublicView(r: Row) { const v = this.toView(r); return { id: v.id, rating: v.rating, punctuality: v.punctuality, quality: v.quality, price_ratio: v.price_ratio, politeness: v.politeness, comment: v.comment, media_ids: v.media_ids, is_late: v.is_late, created_at: v.created_at, response: r.response_id ? { id: String(r.response_id), review_id: v.id, body: String(r.response_body), created_at: toIso(r.response_created_at) } : null }; }
}
