import { MigrationInterface, QueryRunner } from 'typeorm';

/** FCT-016A : création, lecture et agrégats d'avis. */
export class ReviewCreation1744300000014 implements MigrationInterface {
  name = 'ReviewCreation1744300000014';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE review.reviews ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE review.reviews ADD COLUMN IF NOT EXISTS idempotency_key UUID`);
    await q.query(`ALTER TABLE review.reviews ADD COLUMN IF NOT EXISTS request_hash CHAR(64)`);
    await q.query(`ALTER TABLE review.reviews ADD COLUMN IF NOT EXISTS response_snapshot JSONB`);
    await q.query(`ALTER TABLE review.reviews ADD CONSTRAINT ck_reviews_comment_max_1000 CHECK (comment IS NULL OR char_length(comment) <= 1000)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_actor_idempotency ON review.reviews(reviewer_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_reviews_public_keyset ON review.reviews(reviewee_id, status, created_at DESC, id DESC)`);
    await q.query(`CREATE TABLE IF NOT EXISTS review.professional_review_stats (
      professional_id UUID PRIMARY KEY REFERENCES pros.profiles(id),
      rating_avg NUMERIC(4,3),
      punctuality_avg NUMERIC(4,3),
      quality_avg NUMERIC(4,3),
      price_ratio_avg NUMERIC(4,3),
      politeness_avg NUMERIC(4,3),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS review.professional_review_stats`);
    await q.query(`DROP INDEX IF EXISTS review.idx_reviews_public_keyset`);
    await q.query(`DROP INDEX IF EXISTS review.uq_reviews_actor_idempotency`);
    await q.query(`ALTER TABLE review.reviews DROP CONSTRAINT IF EXISTS ck_reviews_comment_max_1000`);
    await q.query(`ALTER TABLE review.reviews DROP COLUMN IF EXISTS response_snapshot`);
    await q.query(`ALTER TABLE review.reviews DROP COLUMN IF EXISTS request_hash`);
    await q.query(`ALTER TABLE review.reviews DROP COLUMN IF EXISTS idempotency_key`);
    await q.query(`ALTER TABLE review.reviews DROP COLUMN IF EXISTS is_late`);
  }
}
