import { MigrationInterface, QueryRunner } from 'typeorm';

const COTONOU_ID = '10000000-0000-4000-8000-000000000001';
const ABOMEY_CALAVI_ID = '10000000-0000-4000-8000-000000000002';

/** Données géographiques strictement nécessaires au pilote Cotonou-Calavi. */
export class SeedPilotCommunes1744200000003 implements MigrationInterface {
  name = 'SeedPilotCommunes1744200000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO geo.divisions
         (id, country_code, parent_id, type, name, depth)
       SELECT $1, 'BJ', id, 'COMMUNE', 'Cotonou', depth + 1
         FROM geo.divisions
        WHERE country_code = 'BJ' AND type = 'DEPARTMENT' AND name = 'Littoral'
        LIMIT 1
       ON CONFLICT (id) DO NOTHING`,
      [COTONOU_ID],
    );
    await queryRunner.query(
      `INSERT INTO geo.divisions
         (id, country_code, parent_id, type, name, depth)
       SELECT $1, 'BJ', id, 'COMMUNE', 'Abomey-Calavi', depth + 1
         FROM geo.divisions
        WHERE country_code = 'BJ' AND type = 'DEPARTMENT' AND name = 'Atlantique'
        LIMIT 1
       ON CONFLICT (id) DO NOTHING`,
      [ABOMEY_CALAVI_ID],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM geo.divisions WHERE id IN ($1, $2)`,
      [COTONOU_ID, ABOMEY_CALAVI_ID],
    );
  }
}
