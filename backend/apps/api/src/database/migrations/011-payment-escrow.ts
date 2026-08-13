import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentEscrow1744200000011 implements MigrationInterface {
  name = 'PaymentEscrow1744200000011';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE pay.webhook_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider_code VARCHAR(32) NOT NULL,
      external_ref VARCHAR(128) NOT NULL, event_type VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL, processed_at TIMESTAMPTZ NULL,
      processing_error TEXT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q.query(
      `CREATE UNIQUE INDEX uq_webhook_events ON pay.webhook_events(provider_code, external_ref, event_type)`,
    );
    await q.query(
      `CREATE INDEX idx_webhook_events_pending ON pay.webhook_events(processed_at) WHERE processed_at IS NULL`,
    );
    await q.query(`ALTER TABLE pay.transactions
      ADD COLUMN client_idempotency_key UUID,
      ADD COLUMN client_request_hash VARCHAR(64)`);
    await q.query(
      `CREATE UNIQUE INDEX uq_transactions_client_idempotency ON pay.transactions(user_id, client_idempotency_key)
        WHERE client_idempotency_key IS NOT NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_transactions_booking_succeeded ON pay.transactions(booking_id) WHERE status='SUCCEEDED'`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS pay.uq_transactions_booking_succeeded`);
    await q.query(
      `DROP INDEX IF EXISTS pay.uq_transactions_client_idempotency`,
    );
    await q.query(`ALTER TABLE pay.transactions
      DROP COLUMN IF EXISTS client_request_hash, DROP COLUMN IF EXISTS client_idempotency_key`);
    await q.query(`DROP INDEX IF EXISTS pay.idx_webhook_events_pending`);
    await q.query(`DROP INDEX IF EXISTS pay.uq_webhook_events`);
    await q.query(`DROP TABLE pay.webhook_events`);
  }
}
