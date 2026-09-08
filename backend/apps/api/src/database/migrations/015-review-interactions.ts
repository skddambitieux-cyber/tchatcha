import { MigrationInterface, QueryRunner } from 'typeorm';

/** FCT-016B1 : modification unique d'un avis et réponse du professionnel. */
export class ReviewInteractions1744300000015 implements MigrationInterface {
  name = 'ReviewInteractions1744300000015';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE review.reviews ADD COLUMN IF NOT EXISTS edit_count SMALLINT NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE review.reviews ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);
    await q.query(`ALTER TABLE review.reviews ADD CONSTRAINT ck_reviews_edit_count CHECK (edit_count BETWEEN 0 AND 1)`);
    await q.query(`CREATE TABLE IF NOT EXISTS review.review_edits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      review_id UUID NOT NULL REFERENCES review.reviews(id) ON DELETE CASCADE,
      actor_id UUID NOT NULL REFERENCES users.users(id),
      before JSONB NOT NULL,
      after JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (review_id)
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_review_edits_actor ON review.review_edits(actor_id, created_at DESC)`);
    await q.query(`CREATE TABLE IF NOT EXISTS review.responses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      review_id UUID NOT NULL UNIQUE REFERENCES review.reviews(id) ON DELETE CASCADE,
      professional_id UUID NOT NULL REFERENCES pros.profiles(id),
      body VARCHAR(500) NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
      idempotency_key UUID NOT NULL,
      request_hash CHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_review_responses_idempotency ON review.responses(professional_id, idempotency_key)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_review_responses_professional ON review.responses(professional_id, created_at DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS review.responses`);
    await q.query(`DROP TABLE IF EXISTS review.review_edits`);
    await q.query(`ALTER TABLE review.reviews DROP CONSTRAINT IF EXISTS ck_reviews_edit_count`);
    await q.query(`ALTER TABLE review.reviews DROP COLUMN IF EXISTS edited_at`);
    await q.query(`ALTER TABLE review.reviews DROP COLUMN IF EXISTS edit_count`);
  }
}
