/**
 * TCHATCHA — Suite E2E lot 6.3.4 (docs/36 §6, W1–W17).
 * Écritures de la vitrine : PUT /professionals/me, POST/PUT/DELETE
 * /professionals/me/services[/:id], PUT /business_hours, PUT /location.
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

const DIVISION_ID = '66040000-0000-4000-8000-000000000001';
const CATEGORY_ID = '66040000-0000-4000-8000-000000000002';
const CATEGORY_LEAF_ID = '66040000-0000-4000-8000-000000000003';

describe('Lot 6.3.4 — E2E écritures vitrine (36 §6 W1–W17)', () => {
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
        SELECT id FROM users.users WHERE phone LIKE '660400%'
      )
    )`);
    await db.query(`DELETE FROM pros.reputation WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660400%'
      )
    )`);
    await db.query(`DELETE FROM pros.business_hours WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660400%'
      )
    )`);
    await db.query(`DELETE FROM pros.locations WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660400%'
      )
    )`);
    await db.query(`DELETE FROM pros.services WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660400%'
      )
    )`);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660400%'
    )`);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660400%'
    )`);
    await db.query(`DELETE FROM users.users WHERE phone LIKE '660400%'`);
    await db.query(`DELETE FROM geo.divisions WHERE id = '${DIVISION_ID}'`);
    await db.query(
      `DELETE FROM pros.categories WHERE id IN ('${CATEGORY_ID}', '${CATEGORY_LEAF_ID}')`,
    );
  }

  /** Compte ACTIF + rôle fourni (évite le cooldown OTP). */
  async function seedUser(
    phone: string,
    role: 'CLIENT' | 'PROFESSIONAL',
  ): Promise<string> {
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        country_code: 'BJ',
        phone,
        email: null,
        password_hash: '',
        full_name: `Profil ${phone}`,
        status: UserStatus.ACTIVE,
        flags: {},
      }),
    );
    await db.query(
      `INSERT INTO users.user_roles (user_id, role, granted_at) VALUES ($1, $2, now())`,
      [user.id, role],
    );
    return user.id;
  }

  /** Fiche pros.profiles ACTIVE (dénormalisés), version 1. */
  async function seedProfile(
    userId: string,
    opts: { status?: string } = {},
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
        'Plomberie SOS',
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
        JSON.stringify({ whatsapp: '229-97000000' }),
        'BJ',
        1,
      ],
    );
    return profileId;
  }

  /** Catégorie racine + feuille, service primary, horaires, point (vitrine de base). */
  async function seedExtras(profileId: string): Promise<void> {
    await db.query(
      `INSERT INTO geo.divisions (id, country_code, parent_id, type, name,
         name_translations, depth, path, centroid, boundary, active, created_at)
       VALUES ($1, 'BJ', NULL, 'COMMUNE', 'Sèmè-Podji', '{}', 0, NULL, NULL,
         NULL, true, now())
       ON CONFLICT (id) DO NOTHING`,
      [DIVISION_ID],
    );
    await db.query(
      `INSERT INTO pros.categories (id, country_code, parent_id, name, slug,
         icon_url, sort_order, translations, active, created_at, updated_at)
       VALUES ($1, 'BJ', NULL, 'Plomberie', 'plomberie-6604', NULL, 0, '{}',
         true, now(), now()), ($2, 'BJ', $1, 'Dépannage', 'depannage-6604',
         NULL, 1, '{}', true, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [CATEGORY_ID, CATEGORY_LEAF_ID],
    );
    const serviceId = randomUUID();
    await db.query(
      `INSERT INTO pros.services (id, professional_id, category_id, title,
         description, price_from, price_to, price_unit, is_primary,
         sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, 'Dépannage urgent', 'Intervention 24h/24',
         $4, $5, 'PER_JOB', true, 0, now(), now())`,
      [serviceId, profileId, CATEGORY_LEAF_ID, 5000, 15000],
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

  /** Compte PRO + fiche + vitrine de base + login. Retourne token. */
  async function seedPro(phone: string, sessionId: string): Promise<string> {
    const uid = await seedUser(phone, 'PROFESSIONAL');
    const profileId = await seedProfile(uid);
    await seedExtras(profileId);
    const { access_token } = await loginFor(phone, sessionId);
    return access_token;
  }

  const PROFILE_BODY = {
    business_name: 'Plomberie Pro',
    headline: 'Plombier certifié',
    description: 'Devis gratuit 24h',
    experience_years: 12,
    employees_count: 5,
    min_price: 7500,
    website: 'https://plomberie-pro.bj',
    social_links: { whatsapp: '229-97999999' },
    version: 1,
  };

  describe('W1-SUCCES — PUT /professionals/me', () => {
    it('PUT 200 → champs remplacés, version 2, projection complète', async () => {
      const token = await seedPro('66040001', 'e2e-w1');

      const res = await app.http
        .put('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .send(PROFILE_BODY)
        .expect(200);

      expect(res.body.business_name).toBe('Plomberie Pro');
      expect(res.body.headline).toBe('Plombier certifié');
      expect(res.body.min_price).toBe(7500);
      expect(res.body.version).toBe(2);
      expect(res.body.services).toHaveLength(1);
      expect(res.body.location).toMatchObject({ division_name: 'Sèmè-Podji' });
      expect(res.body.business_hours).toHaveLength(2);
    });

    it('website null → colonne NULL (mise à null explicite)', async () => {
      const token = await seedPro('66040002', 'e2e-w1b');

      const res = await app.http
        .put('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...PROFILE_BODY, website: null })
        .expect(200);

      expect(res.body.website).toBeNull();
    });
  });

  describe('W2-VERSION — verrouillage optimiste', () => {
    it('PUT me version obsolète → 409 version_conflict', async () => {
      const token = await seedPro('66040003', 'e2e-w2');

      const res = await app.http
        .put('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...PROFILE_BODY, version: 42 })
        .expect(409);

      expect(res.body.code).toBe('version_conflict');
    });

    it('POST services version obsolète → 409', async () => {
      const token = await seedPro('66040004', 'e2e-w2b');

      const res = await app.http
        .post('/api/v1/professionals/me/services')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: CATEGORY_LEAF_ID,
          title: 'Débouchage',
          price_from: 5000,
          price_unit: 'PER_JOB',
          version: 99,
        })
        .expect(409);

      expect(res.body.code).toBe('version_conflict');
    });

    it('DELETE services version obsolète → 409', async () => {
      const token = await seedPro('66040005', 'e2e-w2c');
      const { id } = (
        await app.http
          .get('/api/v1/professionals/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
      ).body.services[0];

      const res = await app.http
        .delete(`/api/v1/professionals/me/services/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 7 })
        .expect(409);

      expect(res.body.code).toBe('version_conflict');
    });
  });

  describe('W3-GARDES — écritures comme lecture', () => {
    it('PUT me non-PRO → 404 professional_not_found', async () => {
      const uid = await seedUser('66040006', 'CLIENT');
      await seedProfile(uid);
      const { access_token } = await loginFor('66040006', 'e2e-w3');

      const res = await app.http
        .put('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${access_token}`)
        .send(PROFILE_BODY)
        .expect(404);

      expect(res.body.code).toBe('professional_not_found');
    });

    it('POST services fiche SUSPENDED → 403 account_locked', async () => {
      const uid = await seedUser('66040007', 'PROFESSIONAL');
      await seedProfile(uid, { status: 'SUSPENDED' });
      const { access_token } = await loginFor('66040007', 'e2e-w3b');

      const res = await app.http
        .post('/api/v1/professionals/me/services')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ category_id: CATEGORY_LEAF_ID, title: 'Expr', version: 1 })
        .expect(403);

      expect(res.body.code).toBe('account_locked');
    });
  });

  describe('W4-CREATE — POST /professionals/me/services', () => {
    it('POST 201 → service créé, is_primary vrai rétrograde l’ancien (W06)', async () => {
      const token = await seedPro('66040008', 'e2e-w4');

      const res = await app.http
        .post('/api/v1/professionals/me/services')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: CATEGORY_LEAF_ID,
          title: 'Débouchage',
          description: 'Débouchage évier',
          price_from: 5000,
          price_to: 10000,
          price_unit: 'PER_JOB',
          is_primary: true,
          sort_order: 1,
          version: 1,
        })
        .expect(201);

      expect(res.body.version).toBe(2);
      expect(res.body.services).toHaveLength(2);
      const primary = res.body.services.filter((s: { is_primary: boolean }) => s.is_primary);
      expect(primary).toHaveLength(1);
      expect(primary[0].title).toBe('Débouchage');
      expect(primary[0].category_name).toBe('Dépannage');
    });

    it('POST catégorie racine → 422 category_not_assignable (CAT-001)', async () => {
      const token = await seedPro('66040009', 'e2e-w4b');

      const res = await app.http
        .post('/api/v1/professionals/me/services')
        .set('Authorization', `Bearer ${token}`)
        .send({ category_id: CATEGORY_ID, title: 'Expr', version: 1 })
        .expect(422);

      expect(res.body.code).toBe('category_not_assignable');
    });

    it('POST catégorie inconnue → 404 category_not_found', async () => {
      const token = await seedPro('66040010', 'e2e-w4c');

      const res = await app.http
        .post('/api/v1/professionals/me/services')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: randomUUID(),
          title: 'Expr',
          version: 1,
        })
        .expect(404);

      expect(res.body.code).toBe('category_not_found');
    });

    it('POST price_to < price_from → 422 service_invalid', async () => {
      const token = await seedPro('66040011', 'e2e-w4d');

      const res = await app.http
        .post('/api/v1/professionals/me/services')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: CATEGORY_LEAF_ID,
          title: 'Expr',
          price_from: 15000,
          price_to: 5000,
          version: 1,
        })
        .expect(422);

      expect(res.body.code).toBe('service_invalid');
    });

    it('POST body avec clé inconnue → 400 (forbidNonWhitelisted)', async () => {
      const token = await seedPro('66040012', 'e2e-w4e');

      const res = await app.http
        .post('/api/v1/professionals/me/services')
        .set('Authorization', `Bearer ${token}`)
        .send({ category_id: CATEGORY_LEAF_ID, title: 'Expr', version: 1, bogus: 1 })
        .expect(400);

      expect(res.body.message).toBeTruthy();
    });
  });

  describe('W5-UPDATE — PUT /professionals/me/services/:id', () => {
    it('PUT 200 → service remplacé', async () => {
      const token = await seedPro('66040013', 'e2e-w5');
      const me = await app.http
        .get('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const id = me.body.services[0].id;

      const res = await app.http
        .put(`/api/v1/professionals/me/services/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: CATEGORY_LEAF_ID,
          title: 'Dépannage Premium',
          price_from: 8000,
          price_to: 20000,
          price_unit: 'PER_HOUR',
          is_primary: false,
          sort_order: 5,
          version: 1,
        })
        .expect(200);

      expect(res.body.version).toBe(2);
      const updated = res.body.services.find((s: { id: string }) => s.id === id);
      expect(updated).toMatchObject({
        title: 'Dépannage Premium',
        price_from: 8000,
        price_to: 20000,
        price_unit: 'PER_HOUR',
        is_primary: false,
        sort_order: 5,
      });
    });

    it('PUT service inconnu → 404 service_not_found (bump rollbacké)', async () => {
      const token = await seedPro('66040014', 'e2e-w5b');

      const res = await app.http
        .put(`/api/v1/professionals/me/services/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: CATEGORY_LEAF_ID,
          title: 'Expr',
          version: 1,
        })
        .expect(404);

      expect(res.body.code).toBe('service_not_found');
      const me = await app.http
        .get('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.version).toBe(1);
    });
  });

  describe('W6-DELETE — DELETE /professionals/me/services/:id', () => {
    it('DELETE 200 → soft delete, version bumpée', async () => {
      const token = await seedPro('66040015', 'e2e-w6');
      const me = await app.http
        .get('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const id = me.body.services[0].id;

      const res = await app.http
        .delete(`/api/v1/professionals/me/services/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(200);

      expect(res.body.version).toBe(2);
      expect(res.body.services).toEqual([]);
    });

    it('DELETE service inconnu → 404 service_not_found', async () => {
      const token = await seedPro('66040016', 'e2e-w6b');

      const res = await app.http
        .delete(`/api/v1/professionals/me/services/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(404);

      expect(res.body.code).toBe('service_not_found');
    });
  });

  describe('W7-HORAIRES — PUT /professionals/me/business_hours', () => {
    it('PUT 200 → remplacement atomique du jeu', async () => {
      const token = await seedPro('66040017', 'e2e-w7');

      const res = await app.http
        .put('/api/v1/professionals/me/business_hours')
        .set('Authorization', `Bearer ${token}`)
        .send({
          hours: [
            { weekday: 1, open_at: '07:30:00', close_at: '19:00:00', closed: false },
            { weekday: 6, open_at: '10:00:00', close_at: '14:00:00', closed: true },
          ],
          version: 1,
        })
        .expect(200);

      expect(res.body.version).toBe(2);
      expect(res.body.business_hours).toHaveLength(2);
      expect(res.body.business_hours[0]).toMatchObject({
        weekday: 1,
        open_at: '07:30:00',
        close_at: '19:00:00',
        closed: false,
      });
    });

    it('doublon weekday → 422 business_hours_invalid, jeu inchangé', async () => {
      const token = await seedPro('66040018', 'e2e-w7b');

      const res = await app.http
        .put('/api/v1/professionals/me/business_hours')
        .set('Authorization', `Bearer ${token}`)
        .send({
          hours: [
            { weekday: 1, open_at: '08:00:00', close_at: '18:00:00' },
            { weekday: 1, open_at: '09:00:00', close_at: '12:00:00' },
          ],
          version: 1,
        })
        .expect(422);

      expect(res.body.code).toBe('business_hours_invalid');
      const me = await app.http
        .get('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.business_hours).toHaveLength(2);
      expect(me.body.version).toBe(1);
    });

    it('close ≤ open → 422 business_hours_invalid', async () => {
      const token = await seedPro('66040019', 'e2e-w7c');

      const res = await app.http
        .put('/api/v1/professionals/me/business_hours')
        .set('Authorization', `Bearer ${token}`)
        .send({
          hours: [{ weekday: 1, open_at: '18:00:00', close_at: '08:00:00' }],
          version: 1,
        })
        .expect(422);

      expect(res.body.code).toBe('business_hours_invalid');
    });

    it('jeu vide → remplacement à vide (0 ligne)', async () => {
      const token = await seedPro('66040020', 'e2e-w7d');

      const res = await app.http
        .put('/api/v1/professionals/me/business_hours')
        .set('Authorization', `Bearer ${token}`)
        .send({ hours: [], version: 1 })
        .expect(200);

      expect(res.body.business_hours).toEqual([]);
    });
  });

  describe('W8-LOCATION — PUT /professionals/me/location', () => {
    it('PUT 200 → upsert, coordonnées remplacées, version bumpée', async () => {
      const token = await seedPro('66040021', 'e2e-w8');

      const res = await app.http
        .put('/api/v1/professionals/me/location')
        .set('Authorization', `Bearer ${token}`)
        .send({
          lat: 6.49,
          lon: 2.61,
          division_id: DIVISION_ID,
          service_radius_km: 25,
          address_text: 'Zogbo, Cotonou',
          version: 1,
        })
        .expect(200);

      expect(res.body.version).toBe(2);
      expect(res.body.location).toMatchObject({
        lat: 6.49,
        lon: 2.61,
        division_name: 'Sèmè-Podji',
        service_radius_km: 25,
        address_text: 'Zogbo, Cotonou',
      });
    });

    it('division inconnue → 404 division_not_found, location inchangée', async () => {
      const token = await seedPro('66040022', 'e2e-w8b');

      const res = await app.http
        .put('/api/v1/professionals/me/location')
        .set('Authorization', `Bearer ${token}`)
        .send({
          lat: 6.49,
          lon: 2.61,
          division_id: randomUUID(),
          version: 1,
        })
        .expect(404);

      expect(res.body.code).toBe('division_not_found');
      const me = await app.http
        .get('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.location.lat).toBe(6.438544);
      expect(me.body.version).toBe(1);
    });

    it('lat hors bornes → 400 validation', async () => {
      const token = await seedPro('66040023', 'e2e-w8c');

      const res = await app.http
        .put('/api/v1/professionals/me/location')
        .set('Authorization', `Bearer ${token}`)
        .send({ lat: 95, lon: 2.35, version: 1 })
        .expect(400);

      expect(res.body.message).toBeTruthy();
    });
  });
});
