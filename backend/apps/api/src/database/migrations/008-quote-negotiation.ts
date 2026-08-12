import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteNegotiation1744200000007 implements MigrationInterface {
  name = 'QuoteNegotiation1744200000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE market.quotes
      ADD COLUMN created_by UUID REFERENCES users.users(id),
      ADD COLUMN actor_idempotency_key UUID,
      ADD COLUMN actor_request_hash VARCHAR(64)`);
    await queryRunner.query(`UPDATE market.quotes q SET created_by=p.user_id
      FROM pros.profiles p WHERE p.id=q.professional_id AND q.created_by IS NULL`);
    await queryRunner.query(`ALTER TABLE market.quotes ALTER COLUMN created_by SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_quotes_actor_idempotency
      ON market.quotes(created_by, actor_idempotency_key)
      WHERE actor_idempotency_key IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS market.uq_quotes_actor_idempotency`);
    await queryRunner.query(`ALTER TABLE market.quotes DROP COLUMN IF EXISTS actor_request_hash,
      DROP COLUMN IF EXISTS actor_idempotency_key, DROP COLUMN IF EXISTS created_by`);
  }
}
