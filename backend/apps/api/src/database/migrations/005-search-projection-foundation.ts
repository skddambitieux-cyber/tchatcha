import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fondation Search MVP : éligibilité publique et reconstruction atomique. */
export class SearchProjectionFoundation1744200000004 implements MigrationInterface {
  name = 'SearchProjectionFoundation1744200000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
    await queryRunner.query(`
      ALTER TABLE search.pro_search_docs
      ADD COLUMN verified BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX idx_search_location_metric
      ON search.pro_search_docs USING GIST ((location::geography))
    `);

    // Source unique de la règle publique, partagée par fiche, backfill et Search.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION search.is_professional_publishable(target_id UUID)
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      AS $$
        SELECT EXISTS (
          SELECT 1
            FROM pros.profiles p
            JOIN users.users u ON u.id = p.user_id
           WHERE p.id = target_id
             AND p.status = 'ACTIVE'
             AND p.deleted_at IS NULL
             AND u.status = 'ACTIVE'
             AND u.deleted_at IS NULL
             AND u.anonymized_at IS NULL
             AND EXISTS (
               SELECT 1 FROM users.user_roles ur
                WHERE ur.user_id = u.id AND ur.role = 'PROFESSIONAL'
             )
        )
      $$
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION search.rebuild_professional_search_doc(target_id UUID)
      RETURNS VOID
      LANGUAGE plpgsql
      AS $$
      BEGIN
        DELETE FROM search.pro_search_docs WHERE professional_id = target_id;

        IF NOT search.is_professional_publishable(target_id) THEN
          RETURN;
        END IF;

        INSERT INTO search.pro_search_docs (
          professional_id, country_code, status, category_ids, name_search,
          name_trgm, rating_avg, trust_score, min_price, location, division_id,
          available_today, available_now, available_until, updated_at, version,
          verified
        )
        WITH RECURSIVE category_tree AS (
          SELECT c.id, c.parent_id
            FROM pros.categories c
            JOIN pros.services s ON s.category_id = c.id
           WHERE s.professional_id = target_id AND s.deleted_at IS NULL
             AND c.active = true AND c.deleted_at IS NULL
          UNION
          SELECT parent.id, parent.parent_id
            FROM pros.categories parent
            JOIN category_tree child ON child.parent_id = parent.id
           WHERE parent.active = true AND parent.deleted_at IS NULL
        ), text_data AS (
          SELECT
            COALESCE((SELECT array_agg(ct.id) FROM category_tree ct), '{}')::uuid[] AS category_ids,
            COALESCE((SELECT string_agg(c.name, ' ')
                        FROM category_tree ct JOIN pros.categories c ON c.id = ct.id), '') AS category_names,
            COALESCE((SELECT string_agg(s.title, ' ')
                        FROM pros.services s
                       WHERE s.professional_id = target_id AND s.deleted_at IS NULL), '') AS service_titles
        )
        SELECT p.id, p.country_code, p.status, td.category_ids,
               to_tsvector('simple', unaccent(concat_ws(' ', p.business_name,
                 p.headline, td.category_names, td.service_titles))),
               left(unaccent(concat_ws(' ', p.business_name, p.headline,
                 td.category_names, td.service_titles)), 160),
               p.rating_avg, p.trust_score, p.min_price, l.location,
               l.division_id, false, false, NULL, now(), p.version, p.verified
          FROM pros.profiles p
          JOIN pros.locations l ON l.professional_id = p.id
          CROSS JOIN text_data td
         WHERE p.id = target_id;
      END
      $$
    `);

    await queryRunner.query(`
      SELECT search.rebuild_professional_search_doc(id)
      FROM pros.profiles
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS search.rebuild_professional_search_doc(UUID)`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS search.is_professional_publishable(UUID)`);
    await queryRunner.query(`DROP INDEX IF EXISTS search.idx_search_location_metric`);
    await queryRunner.query(`ALTER TABLE search.pro_search_docs DROP COLUMN IF EXISTS verified`);
  }
}
