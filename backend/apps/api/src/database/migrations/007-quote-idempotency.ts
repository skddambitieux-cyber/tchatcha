import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteIdempotency1744200000006 implements MigrationInterface {
  name = 'QuoteIdempotency1744200000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE market.quotes
      ADD COLUMN professional_idempotency_key UUID,
      ADD COLUMN professional_request_hash VARCHAR(64)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_quotes_professional_idempotency
      ON market.quotes(professional_id, professional_idempotency_key)
      WHERE professional_idempotency_key IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS market.uq_quotes_professional_idempotency`);
    await queryRunner.query(`ALTER TABLE market.quotes
      DROP COLUMN IF EXISTS professional_request_hash,
      DROP COLUMN IF EXISTS professional_idempotency_key`);
  }
}
