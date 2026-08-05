/**
 * TCHATCHA — Seed : pays + catalogue de catégories (20-catalogue-benin.md).
 * 4 groupes racines + 15 sous-catégories feuilles, Open/Closed (06a §4).
 * Le Bénin = pays pilote ; autres pays ajoutables sans code (ADR-013).
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedCatalogueBenin1744200000001 implements MigrationInterface {
  name = 'SeedCatalogueBenin1744200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Pays : Bénin (pilote) + voisins Phase 3
    await queryRunner.query(`
      INSERT INTO geo.countries (code, name, currency, phone_code, locale_default)
      VALUES
        ('BJ', 'Bénin', 'XOF', '+229', 'fr'),
        ('TG', 'Togo', 'XOF', '+228', 'fr'),
        ('BF', 'Burkina Faso', 'XOF', '+226', 'fr'),
        ('NE', 'Niger', 'XOF', '+227', 'fr')
      ON CONFLICT (code) DO NOTHING
    `);

    // 2. Divisions du Bénin (12 départements — arborescence pilote)
    await queryRunner.query(`
      INSERT INTO geo.divisions (id, country_code, parent_id, type, name, depth)
      VALUES
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Littoral', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Atlantique', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Ouémé', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Plateau', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Zou', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Collines', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Couffo', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Mono', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Borgou', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Alibori', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Atacora', 0),
        (gen_random_uuid(), 'BJ', NULL, 'DEPARTMENT', 'Donga', 0)
    `);

    // 3. Catégories racines
    const root: Record<string, string> = {};
    const insertRoot = async (slug: string, name: string, icon: string) => {
      const id = await queryRunner.query(
        `INSERT INTO pros.categories (country_code, name, slug, icon_url, sort_order)
         VALUES ('BJ', $1, $2, $3, $4) RETURNING id`,
        [name, slug, icon, Object.keys(root).length],
      );
      root[slug] = id[0].id;
    };
    await insertRoot('construction', 'Construction', '🔨');
    await insertRoot('maison', 'Maison & Entretien', '🏠');
    await insertRoot('restauration', 'Restauration', '🍛');
    await insertRoot('numerique', 'Numérique', '💻');

    // 4. Sous-catégories feuilles (15 — 20-catalogue-benin.md)
    const leaf = async (parent: string, slug: string, name: string, icon: string) => {
      await queryRunner.query(
        `INSERT INTO pros.categories (country_code, parent_id, name, slug, icon_url, sort_order)
         VALUES ('BJ', $1, $2, $3, $4, $5)`,
        [root[parent], name, slug, icon, 0],
      );
    };
    await leaf('construction', 'macons', 'Maçons', '🧱');
    await leaf('construction', 'carreleurs', 'Carreleurs', '🔲');
    await leaf('construction', 'plombiers', 'Plombiers', '🔧');
    await leaf('construction', 'electriciens', 'Électriciens', '⚡');
    await leaf('construction', 'peintres', 'Peintres', '🖌️');
    await leaf('construction', 'menuisiers', 'Menuisiers', '🪚');
    await leaf('maison', 'menage', 'Ménage', '🧹');
    await leaf('maison', 'jardinage', 'Jardinage', '🌿');
    await leaf('restauration', 'restaurants', 'Restaurants', '🍽️');
    await leaf('restauration', 'fast-foods', 'Fast-foods', '🍔');
    await leaf('restauration', 'traiteurs', 'Traiteurs', '🥘');
    await leaf('numerique', 'informaticiens', 'Informaticiens', '🖥️');
    await leaf('numerique', 'graphistes', 'Graphistes', '🎨');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM pros.categories WHERE country_code = 'BJ'`);
    await queryRunner.query(`DELETE FROM geo.divisions WHERE country_code = 'BJ'`);
    await queryRunner.query(`DELETE FROM geo.countries WHERE code IN ('BJ','TG','BF','NE')`);
  }
}