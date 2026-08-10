/**
 * TCHATCHA — Migration 003 : pros.verifications (38 §5, docs/06a L454-470).
 * Dossier de vérification du professionnel (6.3.5b) : CIN + selfie
 * (obligatoires), justificatifs optionnels (PRO_DOCUMENT / DIPLOMA).
 * La file de modération admin.validation_tasks existe déjà (001) — aucune
 * modification ici. Additive, idempotente (ADR-011).
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProsVerifications1744200000002 implements MigrationInterface {
  name = 'ProsVerifications1744200000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE pros.verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        professional_id UUID NOT NULL REFERENCES pros.profiles(id),
        type VARCHAR(24) NOT NULL,
        media_id UUID NOT NULL REFERENCES media.files(id),
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        reviewed_by UUID REFERENCES users.users(id),
        reviewed_at TIMESTAMPTZ,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_verifications_status ON pros.verifications(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_verifications_pro ON pros.verifications(professional_id, status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE pros.verifications`);
  }
}
