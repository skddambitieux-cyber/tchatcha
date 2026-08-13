import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingSlots1744200000009 implements MigrationInterface {
  name = 'BookingSlots1744200000009';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await q.query(`CREATE TABLE pros.availability_slots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), professional_id UUID NOT NULL REFERENCES pros.profiles(id) ON DELETE CASCADE,
      start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
      version INT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT ck_availability_slot_range CHECK(end_at>start_at))`);
    await q.query(
      `CREATE INDEX idx_availability_slots_pro_start ON pros.availability_slots(professional_id,start_at) WHERE active=true`,
    );
    await q.query(`CREATE FUNCTION pros.protect_published_slot_schedule() RETURNS trigger AS $$
      BEGIN
        IF NEW.professional_id IS DISTINCT FROM OLD.professional_id
          OR NEW.start_at IS DISTINCT FROM OLD.start_at
          OR NEW.end_at IS DISTINCT FROM OLD.end_at THEN
          RAISE EXCEPTION 'published slot schedule is immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_protect_published_slot_schedule
      BEFORE UPDATE ON pros.availability_slots FOR EACH ROW
      EXECUTE FUNCTION pros.protect_published_slot_schedule()`);
    await q.query(`CREATE TABLE pros.availability_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), professional_id UUID NOT NULL REFERENCES pros.profiles(id) ON DELETE CASCADE,
      start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL, reason VARCHAR(64), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT ck_availability_override_range CHECK(end_at>start_at))`);
    await q.query(
      `CREATE INDEX idx_availability_overrides_pro_start ON pros.availability_overrides(professional_id,start_at)`,
    );
    await q.query(`ALTER TABLE market.bookings ADD COLUMN slot_id UUID REFERENCES pros.availability_slots(id),
      ADD COLUMN price NUMERIC(14,2), ADD COLUMN currency CHAR(3),
      ADD COLUMN client_idempotency_key UUID, ADD COLUMN client_request_hash VARCHAR(64)`);
    await q.query(`ALTER TABLE market.bookings
      ADD CONSTRAINT ck_bookings_new_slot_required CHECK(slot_id IS NOT NULL) NOT VALID,
      ADD CONSTRAINT ck_bookings_new_end_required CHECK(scheduled_end IS NOT NULL) NOT VALID,
      ADD CONSTRAINT ck_bookings_new_price_required CHECK(price IS NOT NULL) NOT VALID,
      ADD CONSTRAINT ck_bookings_new_currency_required CHECK(currency IS NOT NULL) NOT VALID`);
    await q.query(`CREATE UNIQUE INDEX uq_bookings_client_idempotency ON market.bookings(client_id,client_idempotency_key)
      WHERE client_idempotency_key IS NOT NULL`);
    await q.query(
      `CREATE UNIQUE INDEX uq_bookings_active_slot ON market.bookings(slot_id) WHERE status IN('CONFIRMED','IN_PROGRESS')`,
    );
    await q.query(`ALTER TABLE market.bookings ADD CONSTRAINT ex_bookings_professional_schedule EXCLUDE USING gist
      (professional_id WITH =, tstzrange(scheduled_start,scheduled_end,'[)') WITH &&) WHERE(status IN('CONFIRMED','IN_PROGRESS'))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE market.bookings DROP CONSTRAINT IF EXISTS ex_bookings_professional_schedule`,
    );
    await q.query(`ALTER TABLE market.bookings
      DROP CONSTRAINT IF EXISTS ck_bookings_new_currency_required,
      DROP CONSTRAINT IF EXISTS ck_bookings_new_price_required,
      DROP CONSTRAINT IF EXISTS ck_bookings_new_end_required,
      DROP CONSTRAINT IF EXISTS ck_bookings_new_slot_required`);
    await q.query(`DROP INDEX IF EXISTS market.uq_bookings_active_slot`);
    await q.query(`DROP INDEX IF EXISTS market.uq_bookings_client_idempotency`);
    await q.query(`ALTER TABLE market.bookings DROP COLUMN client_request_hash, DROP COLUMN client_idempotency_key,
      DROP COLUMN currency, DROP COLUMN price, DROP COLUMN slot_id`);
    await q.query(`DROP TABLE pros.availability_overrides`);
    await q.query(`DROP TABLE pros.availability_slots`);
    await q.query(
      `DROP FUNCTION IF EXISTS pros.protect_published_slot_schedule()`,
    );
  }
}
