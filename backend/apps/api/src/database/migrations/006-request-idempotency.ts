import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequestIdempotency1744200000005 implements MigrationInterface {
  name = 'RequestIdempotency1744200000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE market.service_requests
      ADD COLUMN client_idempotency_key UUID,
      ADD COLUMN client_request_hash VARCHAR(64)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_requests_client_idempotency
      ON market.service_requests(client_id, client_idempotency_key)
      WHERE client_idempotency_key IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS market.uq_requests_client_idempotency`);
    await queryRunner.query(`ALTER TABLE market.service_requests
      DROP COLUMN IF EXISTS client_request_hash,
      DROP COLUMN IF EXISTS client_idempotency_key`);
  }
}
