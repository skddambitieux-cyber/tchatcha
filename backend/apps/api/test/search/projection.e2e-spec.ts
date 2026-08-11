import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { SearchProjectionPortToken } from '../../src/modules/search/application/ports/search-projection.port';
import type { SearchProjectionPort } from '../../src/modules/search/application/ports/search-projection.port';
import { createTestApp } from '../test-app';

const PHONE = '66990200001';

describe('Lot 2A — projection Search fiable', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;
  let projection: SearchProjectionPort;
  let professionalId: string;
  let rootCategoryId: string;
  let leafCategoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    projection = app.app.get(SearchProjectionPortToken);
    await cleanup();
    await seedProfessional();
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  async function cleanup() {
    await db.query(`DELETE FROM search.pro_search_docs WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone = $1))`, [PHONE]);
    await db.query(`DELETE FROM pros.locations WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone = $1))`, [PHONE]);
    await db.query(`DELETE FROM pros.services WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone = $1))`, [PHONE]);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone = $1)`, [PHONE]);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone = $1)`, [PHONE]);
    await db.query(`DELETE FROM users.users WHERE phone = $1`, [PHONE]);
  }

  async function seedProfessional() {
    const userId = randomUUID();
    professionalId = randomUUID();
    const categories = await db.query(
      `SELECT leaf.id AS leaf_id, root.id AS root_id
         FROM pros.categories leaf
         JOIN pros.categories root ON root.id = leaf.parent_id
        WHERE leaf.country_code = 'BJ' AND leaf.slug = 'electriciens' LIMIT 1`,
    );
    leafCategoryId = categories[0].leaf_id;
    rootCategoryId = categories[0].root_id;
    const divisions = await db.query(
      `SELECT id FROM geo.divisions WHERE name = 'Cotonou' AND type = 'COMMUNE' LIMIT 1`,
    );
    await db.query(
      `INSERT INTO users.users (id, country_code, phone, password_hash,
         full_name, status, created_at, updated_at)
       VALUES ($1, 'BJ', $2, '', 'Search Test', 'ACTIVE', now(), now())`,
      [userId, PHONE],
    );
    await db.query(
      `INSERT INTO users.user_roles (user_id, role, granted_at)
       VALUES ($1, 'PROFESSIONAL', now())`, [userId],
    );
    await db.query(
      `INSERT INTO pros.profiles (id, user_id, business_name, headline,
         status, verified, rating_avg, rating_count, trust_score,
         completed_jobs, min_price, currency, country_code, version,
         created_at, updated_at)
       VALUES ($1, $2, 'Électricité Lumière', 'Électricien bâtiment', 'ACTIVE',
         false, 4.6, 8, 0.8, 9, 7500, 'XOF', 'BJ', 3, now(), now())`,
      [professionalId, userId],
    );
    await db.query(
      `INSERT INTO pros.services (id, professional_id, category_id, title,
         is_primary, created_at, updated_at)
       VALUES ($1, $2, $3, 'Dépannage électrique', true, now(), now())`,
      [randomUUID(), professionalId, leafCategoryId],
    );
    await db.query(
      `INSERT INTO pros.locations (professional_id, country_code, division_id,
         location, service_radius_km, address_text, updated_at)
       VALUES ($1, 'BJ', $2, ST_SetSRID(ST_MakePoint(2.42, 6.37), 4326),
         10, 'Adresse privée', now())`,
      [professionalId, divisions[0].id],
    );
  }

  it('reconstruit toutes les données indexables, catégories parentes incluses', async () => {
    await projection.rebuild(professionalId);
    const rows = await db.query(
      `SELECT professional_id, verified, category_ids, name_trgm, rating_avg,
              min_price, division_id, version
         FROM search.pro_search_docs WHERE professional_id = $1`,
      [professionalId],
    );
    expect(rows[0]).toMatchObject({
      professional_id: professionalId,
      verified: false,
      name_trgm: expect.stringContaining('Electricite Lumiere'),
    });
    expect(rows[0].category_ids).toEqual(
      expect.arrayContaining([leafCategoryId, rootCategoryId]),
    );
    expect(Number(rows[0].min_price)).toBe(7500);
    expect(Number(rows[0].version)).toBe(3);
  });

  it('remplace intégralement la ligne après une modification', async () => {
    await db.query(
      `UPDATE pros.profiles SET verified = true, min_price = 9000,
         business_name = 'Nouveau Nom', version = version + 1 WHERE id = $1`,
      [professionalId],
    );
    await projection.rebuild(professionalId);
    const rows = await db.query(
      `SELECT verified, min_price, name_trgm, version
         FROM search.pro_search_docs WHERE professional_id = $1`,
      [professionalId],
    );
    expect(rows[0]).toMatchObject({ verified: true });
    expect(Number(rows[0].min_price)).toBe(9000);
    expect(rows[0].name_trgm).toContain('Nouveau Nom');
    expect(Number(rows[0].version)).toBe(4);
  });

  it('supprime immédiatement un professionnel devenu non publiable', async () => {
    await db.query(`UPDATE pros.profiles SET status = 'SUSPENDED' WHERE id = $1`, [professionalId]);
    await projection.rebuild(professionalId);
    const rows = await db.query(
      `SELECT 1 FROM search.pro_search_docs WHERE professional_id = $1`,
      [professionalId],
    );
    expect(rows).toHaveLength(0);
    await app.http.get(`/api/v1/professionals/${professionalId}`).expect(404);
  });
});
