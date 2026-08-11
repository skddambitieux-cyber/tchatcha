import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';

const PHONE = '66990100001';

describe('Lot 1 — Catalogue, Geo et fiche professionnelle publique', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;
  let profileId: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    await cleanup();
    profileId = await seedPublicProfessional();
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  async function cleanup() {
    await db.query(`DELETE FROM media.files WHERE owner_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone = $1))`, [PHONE]);
    await db.query(`DELETE FROM pros.reputation WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone = $1))`, [PHONE]);
    await db.query(`DELETE FROM pros.locations WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN
        (SELECT id FROM users.users WHERE phone = $1))`, [PHONE]);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone = $1)`, [PHONE]);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone = $1)`, [PHONE]);
    await db.query(`DELETE FROM users.users WHERE phone = $1`, [PHONE]);
  }

  async function seedPublicProfessional() {
    const userId = randomUUID();
    const proId = randomUUID();
    await db.query(
      `INSERT INTO users.users (id, country_code, phone, password_hash,
         full_name, status, created_at, updated_at)
       VALUES ($1, 'BJ', $2, '', 'Test Public', 'ACTIVE', now(), now())`,
      [userId, PHONE],
    );
    await db.query(
      `INSERT INTO users.user_roles (user_id, role, granted_at)
       VALUES ($1, 'PROFESSIONAL', now())`, [userId],
    );
    await db.query(
      `INSERT INTO pros.profiles (id, user_id, business_name, headline,
         description, status, verified, rating_avg, rating_count, trust_score,
         completed_jobs, currency, country_code, created_at, updated_at)
       VALUES ($1, $2, 'Alpha Services', 'Artisan à Cotonou', 'Description',
         'ACTIVE', false, 4.2, 3, 0.9, 4, 'XOF', 'BJ', now(), now())`,
      [proId, userId],
    );
    const divisions = await db.query(
      `SELECT id FROM geo.divisions WHERE name = 'Cotonou' AND type = 'COMMUNE' LIMIT 1`,
    );
    await db.query(
      `INSERT INTO pros.locations (professional_id, country_code, division_id,
         location, service_radius_km, address_text, updated_at)
       VALUES ($1, 'BJ', $2, ST_SetSRID(ST_MakePoint(2.42, 6.37), 4326),
         12, 'Adresse privée', now())`, [proId, divisions[0].id],
    );
    await db.query(
      `INSERT INTO pros.reputation (professional_id, completed_jobs,
         trust_score, trust_level, recomputed_at, created_at, updated_at)
       VALUES ($1, 4, 0.9, 'TRUSTED', now(), now(), now())`, [proId],
    );
    await db.query(
      `INSERT INTO media.files (id, owner_type, owner_id, purpose, media_type,
         mime_type, url, s3_key, status, created_at, updated_at)
       VALUES ($1, 'PROFESSIONAL', $2, 'PORTFOLIO', 'IMAGE', 'image/jpeg',
         'https://cdn.example/public.jpg', 'private/key', 'READY', now(), now()),
              ($3, 'PROFESSIONAL', $2, 'VERIFICATION', 'IMAGE', 'image/jpeg',
         'https://cdn.example/private.jpg', 'private/document', 'READY', now(), now())`,
      [randomUUID(), proId, randomUUID()],
    );
    return proId;
  }

  it('lists only active catalogue entries', async () => {
    const response = await app.http.get('/api/v1/categories?country_code=BJ').expect(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items.every((item: { active?: boolean }) => item.active === undefined)).toBe(true);
    expect(response.body.items.some((item: { slug: string }) => item.slug === 'plombiers')).toBe(true);
  });

  it('lists active countries and the two pilot communes', async () => {
    const countries = await app.http.get('/api/v1/geo/countries').expect(200);
    expect(countries.body.items.some((item: { code: string }) => item.code === 'BJ')).toBe(true);
    const divisions = await app.http
      .get('/api/v1/geo/countries/BJ/divisions?type=COMMUNE')
      .expect(200);
    expect(divisions.body.items.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(['Cotonou', 'Abomey-Calavi']),
    );
  });

  it('publishes an unverified ACTIVE professional without private fields', async () => {
    const response = await app.http
      .get(`/api/v1/professionals/${profileId}`)
      .expect(200);
    expect(response.body).toMatchObject({
      id: profileId,
      verified: false,
      reputation: { score_visible: false, trust_score: null, trust_level: 'NEW' },
      location: { division_name: 'Cotonou', service_radius_km: 12 },
    });
    expect(response.body).not.toHaveProperty('user_id');
    expect(response.body).not.toHaveProperty('verified_at');
    expect(response.body.location).not.toHaveProperty('lat');
    expect(response.body.location).not.toHaveProperty('lon');
    expect(response.body.location).not.toHaveProperty('address_text');
    expect(response.body.portfolio).toHaveLength(1);
    expect(response.body.portfolio[0]).not.toHaveProperty('s3_key');
  });

  it('returns the same public 404 for absent and non-publishable profiles', async () => {
    await app.http.get(`/api/v1/professionals/${randomUUID()}`).expect(404);
    await db.query(`UPDATE pros.profiles SET status = 'SUSPENDED' WHERE id = $1`, [profileId]);
    const response = await app.http.get(`/api/v1/professionals/${profileId}`).expect(404);
    expect(response.body.code).toBe('professional_not_found');
  });
});
