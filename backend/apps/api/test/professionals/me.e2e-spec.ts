/**
 * TCHATCHA — Suite E2E lot 6.3.3 (docs/35 §6, P1–P8).
 * GET /api/v1/professionals/me : vitrine pro du propriétaire authentifié.
 * Exécution : npx nx e2e api — base isolée (E2E_DATABASE_URL), SMS espionné.
 */
import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { createTestApp } from '../test-app';
import { User, UserStatus } from '../../src/modules/auth/domain/entities/user.entity';

interface AuthPair {
  access_token: string;
  refresh_token: string;
}

const DIVISION_ID = '66030000-0000-4000-8000-000000000001';
const CATEGORY_ID = '66030000-0000-4000-8000-000000000002';

describe('Lot 6.3.3 — E2E GET /professionals/me (35 §6 P1–P8)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app?.close();
  });

  async function cleanupTestData(): Promise<void> {
    await db.query(`DELETE FROM media.files WHERE owner_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660300%'
      )
    )`);
    await db.query(`DELETE FROM pros.reputation WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660300%'
      )
    )`);
    await db.query(`DELETE FROM pros.business_hours WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660300%'
      )
    )`);
    await db.query(`DELETE FROM pros.locations WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660300%'
      )
    )`);
    await db.query(`DELETE FROM pros.services WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660300%'
      )
    )`);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660300%'
    )`);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660300%'
    )`);
    await db.query(`DELETE FROM users.users WHERE phone LIKE '660300%'`);
    await db.query(`DELETE FROM geo.divisions WHERE id = '${DIVISION_ID}'`);
    await db.query(`DELETE FROM pros.categories WHERE id = '${CATEGORY_ID}'`);
  }

  /** Compte ACTIF + rôle fourni (évite le cooldown OTP). */
  async function seedUser(
    phone: string,
    role: 'CLIENT' | 'PROFESSIONAL',
    opts: { status?: UserStatus } = {},
  ): Promise<string> {
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        country_code: 'BJ',
        phone,
        email: null,
        password_hash: '',
        full_name: `Profil ${phone}`,
        status: opts.status ?? UserStatus.ACTIVE,
        flags: {},
      }),
    );
    await db.query(
      `INSERT INTO users.user_roles (user_id, role, granted_at) VALUES ($1, $2, now())`,
      [user.id, role],
    );
    return user.id;
  }

  /** Fiche pros.profiles ACTIVE (dénormalisés). Retourne l'id fiche. */
  async function seedProfile(
    userId: string,
    opts: { status?: string; business_name?: string } = {},
  ): Promise<string> {
    const profileId = randomUUID();
    await db.query(
      `INSERT INTO pros.profiles (
         id, user_id, business_name, headline, description, experience_years,
         employees_count, status, verified, verified_at, rating_avg,
         rating_count, trust_score, completed_jobs, response_time_min,
         min_price, currency, website, social_links, country_code, version,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21, now(), now()
       )`,
      [
        profileId,
        userId,
        opts.business_name ?? 'Plomberie SOS',
        'Plombier 15 ans Cotonou',
        'Dépannage rapide et devis gratuit',
        15,
        3,
        opts.status ?? 'ACTIVE',
        true,
        '2026-08-07T08:05:00.000Z',
        4.5,
        12,
        0.82,
        34,
        30,
        5000,
        'XOF',
        'https://plomberie-sos.bj',
        JSON.stringify({ whatsapp: '229-97000000', facebook: 'plombos' }),
        'BJ',
        1,
      ],
    );
    return profileId;
  }

  /** Données de vitrine : division, catégorie, service, heures, point, portfolio, réputation. */
  async function seedExtras(profileId: string): Promise<void> {
    await db.query(
      `INSERT INTO geo.divisions (id, country_code, parent_id, type, name,
         name_translations, depth, path, centroid, boundary, active, created_at)
       VALUES ($1, 'BJ', NULL, 'COMMUNE', 'Sèmè-Podji', '{}', 0, NULL, NULL,
         NULL, true, now())`,
      [DIVISION_ID],
    );
    await db.query(
      `INSERT INTO pros.categories (id, country_code, parent_id, name, slug,
         icon_url, sort_order, translations, active, created_at, updated_at)
       VALUES ($1, 'BJ', NULL, 'Plomberie', 'plomberie', NULL, 0, '{}', true,
         now(), now())`,
      [CATEGORY_ID],
    );
    const serviceId = randomUUID();
    await db.query(
      `INSERT INTO pros.services (id, professional_id, category_id, title,
         description, price_from, price_to, price_unit, is_primary,
         sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, 'Dépannage urgent', 'Intervention 24h/24',
         $4, $5, 'PER_JOB', true, 0, now(), now())`,
      [serviceId, profileId, CATEGORY_ID, 5000, 15000],
    );
    await db.query(
      `INSERT INTO pros.business_hours (professional_id, weekday, open_at,
         close_at, closed)
       VALUES ($1, 1, '08:00:00', '18:00:00', false), ($1, 6, '10:00:00', '14:00:00', true)`,
      [profileId],
    );
    await db.query(
      `INSERT INTO pros.locations (professional_id, country_code, division_id,
         location, service_radius_km, address_text, updated_at)
       VALUES ($1, 'BJ', $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, now())`,
      [profileId, DIVISION_ID, 2.350294, 6.438544, 10, 'Rue des Artisans, Sèmè-Podji'],
    );
    for (const [purpose, mediaType, sortOrder] of [
      ['PORTFOLIO', 'IMAGE', 0],
      ['BEFORE_AFTER', 'IMAGE', 1],
      ['PORTFOLIO', 'VIDEO', 2],
      ['PORTFOLIO', 'IMAGE', 3],
    ] as const) {
      await db.query(
        `INSERT INTO media.files (id, owner_type, owner_id, purpose, media_type,
           mime_type, size_bytes, width, height, duration_sec, url, s3_key,
           sort_order, status, created_at, updated_at)
         VALUES ($1, 'PROFESSIONAL', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
           $12, 'READY', now(), now())`,
        [
          randomUUID(),
          profileId,
          purpose,
          mediaType,
          mediaType === 'IMAGE' ? 'image/jpeg' : 'video/mp4',
          1000 + sortOrder,
          1200,
          900,
          mediaType === 'VIDEO' ? 30 : null,
          `https://cdn.example/${purpose.toLowerCase()}${sortOrder}.${mediaType === 'IMAGE' ? 'jpg' : 'mp4'}`,
          `profiles/${profileId}/${sortOrder}`,
          sortOrder,
        ],
      );
    }
    await db.query(
      `INSERT INTO pros.reputation (professional_id, completed_jobs,
         acceptance_rate, cancellation_rate, avg_response_min,
         punctuality_avg, avg_execution_days, disputes_count, seniority_days,
         verification_level, ai_factor, trust_score, trust_level,
         recomputed_at, created_at, updated_at)
       VALUES ($1, 34, 95, 2, 12, 4.7, 3, 0, 1200, 2, 0.5, 0.82, 'TRUSTED',
         '2026-08-07T00:00:00.000Z', now(), now())`,
      [profileId],
    );
  }

  /** Demande → capture → login (OTP LOGIN) → tokens. */
  async function loginFor(phone: string, sessionId: string): Promise<AuthPair> {
    await app.http
      .post('/api/v1/auth/otp/request')
      .send({ country_code: 'BJ', phone, purpose: 'LOGIN' })
      .expect(202);
    const code = app.sms.lastCode('BJ', phone);
    expect(code).toMatch(/^\d{6}$/u);
    const res = await app.http
      .post('/api/v1/auth/login')
      .send({ country_code: 'BJ', phone, code, device: { session_id: sessionId } })
      .expect(200);
    return {
      access_token: res.body.access_token,
      refresh_token: res.body.refresh_token,
    };
  }

  function getMe(token?: string) {
    const req = app.http.get('/api/v1/professionals/me');
    if (token) {
      return req.set('Authorization', `Bearer ${token}`);
    }
    return req;
  }

  describe('P1-SUCCES — vitrine complète', () => {
    it('GET 200 → fiche + localisation + services + horaires + portfolio + réputation', async () => {
      const uid = await seedUser('66030001', 'PROFESSIONAL');
      const profileId = await seedProfile(uid);
      await seedExtras(profileId);
      const { access_token } = await loginFor('66030001', 'e2e-p1');

      const res = await getMe(access_token).expect(200);
      expect(res.body.id).toBe(profileId);
      expect(res.body.user_id).toBe(uid);
      expect(res.body.business_name).toBe('Plomberie SOS');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.verified).toBe(true);
      expect(res.body.rating_avg).toBe(4.5);
      expect(res.body.rating_count).toBe(12);
      expect(res.body.version).toBe(1);

      expect(res.body.location).toMatchObject({
        country_code: 'BJ',
        division_id: DIVISION_ID,
        division_name: 'Sèmè-Podji',
        location_name: 'Sèmè-Podji',
        lat: 6.438544,
        lon: 2.350294,
        service_radius_km: 10,
      });

      expect(res.body.services).toHaveLength(1);
      expect(res.body.services[0]).toMatchObject({
        category_name: 'Plomberie',
        slug: 'plomberie',
        title: 'Dépannage urgent',
        price_from: 5000,
        price_to: 15000,
        price_unit: 'PER_JOB',
        is_primary: true,
      });

      expect(res.body.business_hours).toHaveLength(2);
      expect(res.body.business_hours[0]).toMatchObject({
        weekday: 1,
        open_at: '08:00:00',
        close_at: '18:00:00',
      });

      expect(res.body.portfolio).toHaveLength(4);
      expect(res.body.portfolio.map((p: { purpose: string }) => p.purpose)).toEqual([
        'PORTFOLIO',
        'BEFORE_AFTER',
        'PORTFOLIO',
        'PORTFOLIO',
      ]);

      expect(res.body.reputation).toMatchObject({
        trust_score: 0.82,
        trust_level: 'TRUSTED',
        verification_level: 2,
        acceptance_rate: 95,
        disputes_count: 0,
      });
      expect(res.body.reputation.completed_jobs).toBe(34);
    });
  });

  describe('P2-MINIMAL — fiche sans extras', () => {
    it('GET 200 → lists vides, location/reputation null', async () => {
      const uid = await seedUser('66030002', 'PROFESSIONAL');
      await seedProfile(uid);
      const { access_token } = await loginFor('66030002', 'e2e-p2');

      const res = await getMe(access_token).expect(200);
      expect(res.body.business_name).toBe('Plomberie SOS');
      expect(res.body.location).toBeNull();
      expect(res.body.services).toEqual([]);
      expect(res.body.business_hours).toEqual([]);
      expect(res.body.portfolio).toEqual([]);
      expect(res.body.reputation).toBeNull();
    });
  });

  describe('P3-NONPRO — compte CLIENT', () => {
    it('GET → 404 professional_not_found (non-dévoilement)', async () => {
      const uid = await seedUser('66030003', 'CLIENT');
      await seedProfile(uid);
      const { access_token } = await loginFor('66030003', 'e2e-p3');

      const res = await getMe(access_token).expect(404);
      expect(res.body.code).toBe('professional_not_found');
    });
  });

  describe('P4-NOFICHE — rôle PRO sans fiche', () => {
    it('GET → 404 professional_not_found (non-dévoilement)', async () => {
      await seedUser('66030004', 'PROFESSIONAL');
      const { access_token } = await loginFor('66030004', 'e2e-p4');

      const res = await getMe(access_token).expect(404);
      expect(res.body.code).toBe('professional_not_found');
    });
  });

  describe('P5-SUSPEND — compte SUSPENDED', () => {
    it('GET → 403 account_locked', async () => {
      const uid = await seedUser('66030005', 'PROFESSIONAL');
      await seedProfile(uid);
      const { access_token } = await loginFor('66030005', 'e2e-p5');
      await db.query(`UPDATE users.users SET status = 'SUSPENDED' WHERE id = $1`, [uid]);

      const res = await getMe(access_token).expect(403);
      expect(res.body.code).toBe('account_locked');
    });
  });

  describe('P6-FICHESUSPEND — fiche SUSPENDED', () => {
    it('GET → 403 account_locked (SCR-011, BR-031)', async () => {
      const uid = await seedUser('66030006', 'PROFESSIONAL');
      await seedProfile(uid, { status: 'SUSPENDED' });
      const { access_token } = await loginFor('66030006', 'e2e-p6');

      const res = await getMe(access_token).expect(403);
      expect(res.body.code).toBe('account_locked');
    });
  });

  describe('P7-RGPD — compte anonymisé', () => {
    it('GET → 403 resource_unavailable', async () => {
      const uid = await seedUser('66030007', 'PROFESSIONAL');
      await seedProfile(uid);
      const { access_token } = await loginFor('66030007', 'e2e-p7');
      await db.query(
        `UPDATE users.users SET anonymized_at = now() WHERE id = $1`,
        [uid],
      );

      const res = await getMe(access_token).expect(403);
      expect(res.body.code).toBe('resource_unavailable');
    });
  });

  describe('P8-AUTH — sans Bearer', () => {
    it('GET sans header → 401 unauthorized', async () => {
      const res = await getMe().expect(401);
      expect(res.body.code).toBe('unauthorized');
    });
  });
});