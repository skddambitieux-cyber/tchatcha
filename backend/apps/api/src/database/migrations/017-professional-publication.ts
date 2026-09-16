import { MigrationInterface, QueryRunner } from 'typeorm';

/** R-03A0 : visibilité calculée d’une vitrine professionnelle complète. */
export class ProfessionalPublication1744300000017 implements MigrationInterface {
  name = 'ProfessionalPublication1744300000017';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE OR REPLACE FUNCTION search.is_professional_publishable(target_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $function$
        SELECT EXISTS (
          SELECT 1
            FROM pros.profiles p
            JOIN users.users u ON u.id = p.user_id
           WHERE p.id = target_id
             AND p.status = 'ACTIVE' AND p.deleted_at IS NULL
             AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
             AND u.anonymized_at IS NULL
             AND EXISTS (SELECT 1 FROM users.user_roles ur
                          WHERE ur.user_id = u.id AND ur.role = 'PROFESSIONAL')
             AND NULLIF(trim(p.business_name), '') IS NOT NULL
             AND NULLIF(trim(p.description), '') IS NOT NULL
             AND EXISTS (
               SELECT 1
                 FROM pros.locations l
                 JOIN geo.divisions d ON d.id = l.division_id AND d.active = true
                WHERE l.professional_id = p.id AND l.division_id IS NOT NULL
             )
             AND EXISTS (
               SELECT 1
                 FROM pros.services s
                 JOIN pros.categories c ON c.id = s.category_id
                WHERE s.professional_id = p.id AND s.deleted_at IS NULL
                  AND c.active = true AND c.deleted_at IS NULL
             )
        )
      $function$`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`CREATE OR REPLACE FUNCTION search.is_professional_publishable(target_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $function$
        SELECT EXISTS (
          SELECT 1 FROM pros.profiles p JOIN users.users u ON u.id = p.user_id
           WHERE p.id = target_id AND p.status = 'ACTIVE' AND p.deleted_at IS NULL
             AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
             AND u.anonymized_at IS NULL
             AND EXISTS (SELECT 1 FROM users.user_roles ur
                          WHERE ur.user_id = u.id AND ur.role = 'PROFESSIONAL')
        )
      $function$`);
  }
}
