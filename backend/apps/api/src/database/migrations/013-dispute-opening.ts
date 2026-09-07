import { MigrationInterface, QueryRunner } from 'typeorm';

/** FCT-015 : ouverture idempotente et preuves d'un litige. */
export class DisputeOpening1744300000013 implements MigrationInterface {
  name = 'DisputeOpening1744300000013';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE market.disputes ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`);
    await q.query(`ALTER TABLE market.disputes ADD COLUMN IF NOT EXISTS media_ids UUID[] NOT NULL DEFAULT '{}'`);
    await q.query(`ALTER TABLE market.disputes ADD COLUMN IF NOT EXISTS idempotency_key UUID`);
    await q.query(`ALTER TABLE market.disputes ADD COLUMN IF NOT EXISTS request_hash CHAR(64)`);
    await q.query(`ALTER TABLE market.disputes ADD COLUMN IF NOT EXISTS response_snapshot JSONB`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_disputes_actor_idempotency
      ON market.disputes(opened_by, idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_ops_payout_pending
      ON pay.provider_operations(transaction_id)
      WHERE operation_type='PAYOUT' AND status='PENDING'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS pay.uq_provider_ops_payout_pending`);
    await q.query(`DROP INDEX IF EXISTS market.uq_disputes_actor_idempotency`);
    await q.query(`ALTER TABLE market.disputes DROP COLUMN IF EXISTS response_snapshot`);
    await q.query(`ALTER TABLE market.disputes DROP COLUMN IF EXISTS request_hash`);
    await q.query(`ALTER TABLE market.disputes DROP COLUMN IF EXISTS idempotency_key`);
    await q.query(`ALTER TABLE market.disputes DROP COLUMN IF EXISTS media_ids`);
    await q.query(`ALTER TABLE market.disputes DROP COLUMN IF EXISTS description`);
  }
}
