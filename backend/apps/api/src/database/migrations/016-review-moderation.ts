import { MigrationInterface, QueryRunner } from 'typeorm';

/** FCT-016B2 : signalement et workflow de modération des avis. */
export class ReviewModeration1744300000016 implements MigrationInterface {
  name = 'ReviewModeration1744300000016';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE review.review_flags ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'OPEN'`);
    await q.query(`ALTER TABLE review.review_flags ADD COLUMN IF NOT EXISTS idempotency_key UUID`);
    await q.query(`ALTER TABLE review.review_flags ADD COLUMN IF NOT EXISTS request_hash CHAR(64)`);
    await q.query(`ALTER TABLE review.review_flags ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`);
    await q.query(`ALTER TABLE review.review_flags ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users.users(id)`);
    await q.query(`ALTER TABLE review.review_flags ADD CONSTRAINT ck_review_flags_status CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','DISMISSED'))`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_review_flags_status ON review.review_flags(status, created_at)`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_review_flags_idempotency ON review.review_flags(flagged_by, idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_review_validation_open ON admin.validation_tasks(entity_type, entity_id) WHERE entity_type='REVIEW' AND status IN ('OPEN','IN_REVIEW','PENDING')`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS admin.uq_review_validation_open`);
    await q.query(`DROP INDEX IF EXISTS review.uq_review_flags_idempotency`);
    await q.query(`DROP INDEX IF EXISTS review.idx_review_flags_status`);
    await q.query(`ALTER TABLE review.review_flags DROP CONSTRAINT IF EXISTS ck_review_flags_status`);
    await q.query(`ALTER TABLE review.review_flags DROP COLUMN IF EXISTS resolved_by`);
    await q.query(`ALTER TABLE review.review_flags DROP COLUMN IF EXISTS resolved_at`);
    await q.query(`ALTER TABLE review.review_flags DROP COLUMN IF EXISTS request_hash`);
    await q.query(`ALTER TABLE review.review_flags DROP COLUMN IF EXISTS idempotency_key`);
    await q.query(`ALTER TABLE review.review_flags DROP COLUMN IF EXISTS status`);
  }
}
