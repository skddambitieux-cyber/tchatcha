import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TCHATCHA — FCT-014 (39-cadrage-market-fct-014.md).
 * (1) Commission plateforme par catégorie (BR-094, SCR-129 : seed 10 %).
 * (2) Anti double-libération : au plus UNE opération PAYOUT SUCCEEDED par
 *     transaction (backstop base de RF-BK-08).
 * (3) Rétrocompatibilité : paiements SUCCEEDED antérieurs à FCT-014 → booking
 *     CONFIRMED → IN_PROGRESS (RF-BK-02, 06-schema-base L212).
 */
export class BookingConfirmation1744300000012 implements MigrationInterface {
  name = 'BookingConfirmation1744300000012';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE pros.categories ADD COLUMN commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00`,
    );
    await q.query(
      `ALTER TABLE pros.categories ADD CONSTRAINT ck_categories_commission_rate
         CHECK (commission_rate BETWEEN 0 AND 100)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_provider_ops_release_once ON pay.provider_operations(transaction_id)
         WHERE operation_type='PAYOUT' AND status='SUCCEEDED'`,
    );
    // pay.commissions (06b §2) : snapshot figé de la règle appliquée (BR-094) —
    // jamais créée en 001 (audit FCT-014), le lot en a besoin.
    await q.query(`CREATE TABLE pay.commissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL REFERENCES pay.transactions(id),
      rule_code VARCHAR(64) NOT NULL,
      rate NUMERIC(5,2) NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q.query(
      `CREATE UNIQUE INDEX uq_commissions_transaction ON pay.commissions(transaction_id)`,
    );
    await q.query(
      `ALTER TABLE pay.commissions ADD CONSTRAINT ck_commissions_rate CHECK (rate BETWEEN 0 AND 100)`,
    );
    await q.query(
      `UPDATE market.bookings b SET status='IN_PROGRESS', version=b.version+1, updated_at=now()
       FROM pay.transactions t
       WHERE t.booking_id=b.id AND t.status='SUCCEEDED' AND b.status='CONFIRMED'`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE market.bookings b SET status='CONFIRMED', version=b.version+1, updated_at=now()
       FROM pay.transactions t
       WHERE t.booking_id=b.id AND t.status='SUCCEEDED' AND b.status='IN_PROGRESS'`,
    );
    await q.query(`DROP INDEX IF EXISTS pay.uq_provider_ops_release_once`);
    await q.query(
      `ALTER TABLE pros.categories DROP CONSTRAINT IF EXISTS ck_categories_commission_rate`,
    );
    await q.query(
      `ALTER TABLE pros.categories DROP COLUMN IF EXISTS commission_rate`,
    );
    await q.query(`DROP TABLE IF EXISTS pay.commissions`);
  }
}