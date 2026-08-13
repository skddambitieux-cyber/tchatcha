import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteAcceptance1744200000008 implements MigrationInterface {
  name = 'QuoteAcceptance1744200000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE market.quotes
      ADD COLUMN accepted_by UUID REFERENCES users.users(id),
      ADD COLUMN acceptance_idempotency_key UUID,
      ADD COLUMN acceptance_request_hash VARCHAR(64)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_quotes_acceptance_idempotency
      ON market.quotes(accepted_by, acceptance_idempotency_key)
      WHERE acceptance_idempotency_key IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS market.uq_quotes_acceptance_idempotency`);
    await queryRunner.query(`ALTER TABLE market.quotes DROP COLUMN IF EXISTS acceptance_request_hash,
      DROP COLUMN IF EXISTS acceptance_idempotency_key, DROP COLUMN IF EXISTS accepted_by`);
  }
}
