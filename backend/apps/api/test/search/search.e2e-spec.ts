import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { SearchProjectionPortToken } from '../../src/modules/search/application/ports/search-projection.port';
import type { SearchProjectionPort } from '../../src/modules/search/application/ports/search-projection.port';
import { createTestApp } from '../test-app';

const PHONE_PREFIX = '669903';

describe('Lot 2B — GET /search public', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;
  let projection: SearchProjectionPort;
  let rootCategoryId: string;
  let leafCategoryId: string;
  let cotonouId: string;
  let calaviId: string;
  const professionalIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    projection = app.app.get(SearchProjectionPortToken);
    await cleanup();
    const categories = await db.query(
      `SELECT leaf.id AS leaf_id, root.id AS root_id
         FROM pros.categories leaf JOIN pros.categories root ON root.id = leaf.parent_id
        WHERE leaf.slug = 'electriciens' AND leaf.country_code = 'BJ' LIMIT 1`,
    );
    leafCategoryId = categories[0].leaf_id;
    rootCategoryId = categories[0].root_id;
    const divisions = await db.query(
      `SELECT id, name FROM geo.divisions
        WHERE type = 'COMMUNE' AND name IN ('Cotonou', 'Abomey-Calavi')`,
    );
    cotonouId = divisions.find((row: { name: string }) => row.name === 'Cotonou').id;
    calaviId = divisions.find((row: { name: string }) => row.name === 'Abomey-Calavi').id;
    await seedPro(1, 'Électricité Express', true, 4.8, 6000, cotonouId, 2.42, 6.37);
    await seedPro(2, 'Lumière Services', false, 4.1, 10000, cotonouId, 2.43, 6.37);
    await seedPro(3, 'Calavi Énergie', true, 3.7, 4000, calaviId, 2.35, 6.45);
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  async function cleanup() {
    await db.query(`DELETE FROM media.files WHERE owner_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone LIKE $1))`, [`${PHONE_PREFIX}%`]);
    await db.query(`DELETE FROM search.pro_search_docs WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone LIKE $1))`, [`${PHONE_PREFIX}%`]);
    await db.query(`DELETE FROM pros.locations WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone LIKE $1))`, [`${PHONE_PREFIX}%`]);
    await db.query(`DELETE FROM pros.services WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone LIKE $1))`, [`${PHONE_PREFIX}%`]);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PHONE_PREFIX}%`]);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PHONE_PREFIX}%`]);
    await db.query(`DELETE FROM users.users WHERE phone LIKE $1`, [`${PHONE_PREFIX}%`]);
  }

  async function seedPro(
    index: number,
    name: string,
    verified: boolean,
    rating: number,
    minPrice: number,
    divisionId: string,
    lon: number,
    lat: number,
  ) {
    const userId = randomUUID();
    const professionalId = randomUUID();
    professionalIds.push(professionalId);
    await db.query(
      `INSERT INTO users.users (id, country_code, phone, password_hash,
         full_name, status, created_at, updated_at)
       VALUES ($1, 'BJ', $2, '', $3, 'ACTIVE', now(), now())`,
      [userId, `${PHONE_PREFIX}${String(index).padStart(5, '0')}`, name],
    );
    await db.query(
      `INSERT INTO users.user_roles (user_id, role, granted_at)
       VALUES ($1, 'PROFESSIONAL', now())`, [userId],
    );
    await db.query(
      `INSERT INTO pros.profiles (id, user_id, business_name, headline,
         status, verified, rating_avg, rating_count, trust_score,
         completed_jobs, min_price, currency, country_code, created_at, updated_at)
       VALUES ($1, $2, $3, 'Électricien professionnel', 'ACTIVE', $4, $5,
         $6, 0.8, 12, $7, 'XOF', 'BJ', now(), now())`,
      [professionalId, userId, name, verified, rating, index * 3, minPrice],
    );
    const serviceId = randomUUID();
    await db.query(
      `INSERT INTO pros.services (id, professional_id, category_id, title,
         price_from, is_primary, created_at, updated_at)
       VALUES ($1, $2, $3, 'Dépannage électrique', $4, true, now(), now())`,
      [serviceId, professionalId, leafCategoryId, minPrice],
    );
    await db.query(
      `INSERT INTO pros.locations (professional_id, country_code, division_id,
         location, service_radius_km, address_text, updated_at)
       VALUES ($1, 'BJ', $2, ST_SetSRID(ST_MakePoint($3, $4), 4326),
         10, 'Adresse strictement privée', now())`,
      [professionalId, divisionId, lon, lat],
    );
    if (index === 1) {
      await db.query(
        `INSERT INTO media.files (id, owner_type, owner_id, purpose, media_type,
           mime_type, url, s3_key, status, created_at, updated_at)
         VALUES ($1, 'PROFESSIONAL', $2, 'PORTFOLIO', 'IMAGE', 'image/jpeg',
           'https://cdn.example/search.jpg', 'secret/storage-key', 'READY', now(), now())`,
        [randomUUID(), professionalId],
      );
    }
    await projection.rebuild(professionalId);
  }

  it('recherche sans authentification avec texte sans accents et faute légère', async () => {
    const exact = await app.http.get('/api/v1/search?q=electricite').expect(200);
    expect(exact.body.items).toHaveLength(3);
    expect(exact.body.items[0].business_name).toBe('Électricité Express');
    const fuzzy = await app.http.get('/api/v1/search?q=electrcite').expect(200);
    expect(fuzzy.body.items.length).toBeGreaterThan(0);
  });

  it('filtre catégorie par ancêtre, commune, vérification, note et prix', async () => {
    const response = await app.http
      .get(`/api/v1/search?category_id=${rootCategoryId}&division_id=${cotonouId}&verified=true&min_rating=4.5&min_price=5000&max_price=7000`)
      .expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      business_name: 'Électricité Express',
      verified: true,
      commune: { id: cotonouId, name: 'Cotonou' },
      primary_service: {
        category: { id: leafCategoryId, slug: 'electriciens' },
      },
      image_url: 'https://cdn.example/search.jpg',
    });
  });

  it('filtre par rayon, trie par distance et ne divulgue aucune donnée privée', async () => {
    const response = await app.http
      .get('/api/v1/search?lat=6.37&lon=2.42&radius_km=5&sort=distance')
      .expect(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].business_name).toBe('Électricité Express');
    expect(response.body.items[0].distance_km).toBe(0);
    const serialized = JSON.stringify(response.body);
    for (const forbidden of ['address_text', 'latitude', 'longitude', 'user_id', 'email', 'phone', 's3_key']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('pagine sans doublon avec un curseur keyset opaque', async () => {
    const byPrice = await app.http.get('/api/v1/search?sort=price').expect(200);
    expect(byPrice.body.items.map((item: { min_price: number }) => item.min_price)).toEqual([
      4000, 6000, 10000,
    ]);
    const first = await app.http.get('/api/v1/search?sort=rating&limit=1').expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.next_cursor).toEqual(expect.any(String));
    const second = await app.http
      .get(`/api/v1/search?sort=rating&limit=1&cursor=${encodeURIComponent(first.body.next_cursor)}`)
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  });

  it('rejette les combinaisons invalides et exclut une projection périmée', async () => {
    await app.http.get('/api/v1/search?lat=6.37').expect(400);
    await app.http.get('/api/v1/search?sort=relevance').expect(400);
    await db.query(`UPDATE pros.profiles SET status = 'SUSPENDED' WHERE id = $1`, [professionalIds[0]]);
    const response = await app.http.get('/api/v1/search?q=express').expect(200);
    expect(response.body.items).toHaveLength(0);
  });
});
