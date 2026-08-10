/**
 * TCHATCHA — Suite E2E lot 6.3.5a (docs/37 §6, P1–P14).
 * Presign (POST /media/presign) + cycle portfolio du pro (confirm/update/
 * delete/list sous /professionals/me/portfolio). Storage S3 remplacé par
 * InMemoryStorage (aucun réseau). Exécution : npx nx e2e api.
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

interface PresignResult {
  media_id: string;
  upload_url: string;
  s3_key: string;
  expires_in: number;
}

describe('Lot 6.3.5a — E2E presign + portfolio (37 §6 P1–P14)', () => {
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
        SELECT id FROM users.users WHERE phone LIKE '660401%'
      )
    )`);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660401%'
    )`);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660401%'
    )`);
    await db.query(`DELETE FROM users.users WHERE phone LIKE '660401%'`);
  }

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
        null,
        null,
        'BJ',
        1,
      ],
    );
    return profileId;
  }

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

  async function seedPro(phone: string, sessionId: string): Promise<string> {
    const uid = await seedUser(phone, 'PROFESSIONAL');
    await seedProfile(uid);
    const { access_token } = await loginFor(phone, sessionId);
    return access_token;
  }

  async function presignFor(
    token: string,
    body: Record<string, unknown>,
  ): Promise<PresignResult> {
    const res = await app.http
      .post('/api/v1/media/presign')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    return res.body as PresignResult;
  }

  const PRESIGN_BODY = {
    purpose: 'PORTFOLIO',
    mime_type: 'image/jpeg',
    size_bytes: 2048,
  };

  describe('P1-PRESIGN — POST /media/presign', () => {
    it('P1 201 → clé RF-MD-05, URL présignée, bucket public', async () => {
      const token = await seedPro('66040101', 'e2e-p1');

      const res = await app.http
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${token}`)
        .send(PRESIGN_BODY)
        .expect(201);

      expect(res.body.media_id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(res.body.s3_key).toMatch(
        /^BJ\/PROFESSIONAL\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/u,
      );
      expect(res.body.expires_in).toBe(900);
      expect(res.body.upload_url).toContain(res.body.s3_key);
      expect(app.storage.lastPresignInput?.bucket).toBe('public');
      expect(app.storage.lastPresignInput?.sizeBytes).toBe(2048);
    });

    it('P2 purpose DOCUMENT (réservé 6.3.5b) → 422 media_purpose_not_supported', async () => {
      const token = await seedPro('66040102', 'e2e-p2');

      const res = await app.http
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...PRESIGN_BODY, purpose: 'DOCUMENT' })
        .expect(422);

      expect(res.body.code).toBe('media_purpose_not_supported');
    });

    it('P3 MIME hors whitelist → 422 media_type_not_supported', async () => {
      const token = await seedPro('66040103', 'e2e-p3');

      const res = await app.http
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...PRESIGN_BODY, mime_type: 'application/pdf' })
        .expect(422);

      expect(res.body.code).toBe('media_type_not_supported');
    });

    it('P4 taille > 20 Mo → 422 media_size_exceeded', async () => {
      const token = await seedPro('66040104', 'e2e-p4');

      const res = await app.http
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...PRESIGN_BODY, size_bytes: 21 * 1024 * 1024 })
        .expect(422);

      expect(res.body.code).toBe('media_size_exceeded');
    });

    it('P5a client sans fiche → 404 professional_not_found', async () => {
      const uid = await seedUser('66040105', 'CLIENT');
      const { access_token } = await loginFor('66040105', 'e2e-p5a');

      const res = await app.http
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${access_token}`)
        .send(PRESIGN_BODY)
        .expect(404);

      expect(res.body.code).toBe('professional_not_found');
      void uid;
    });

    it('P5b fiche SUSPENDED → 403 account_locked', async () => {
      const uid = await seedUser('66040106', 'PROFESSIONAL');
      await seedProfile(uid, { status: 'SUSPENDED' });
      const { access_token } = await loginFor('66040106', 'e2e-p5b');

      const res = await app.http
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${access_token}`)
        .send(PRESIGN_BODY)
        .expect(403);

      expect(res.body.code).toBe('account_locked');
    });

    it('P5c non authentifié → 401', async () => {
      const res = await app.http
        .post('/api/v1/media/presign')
        .send(PRESIGN_BODY)
        .expect(401);
      expect(res.body.message).toBeTruthy();
    });
  });

  describe('P6-CONFIRM — POST /professionals/me/portfolio/:id/confirm', () => {
    it('P6 200 → item READY visible, version 2', async () => {
      const token = await seedPro('66040107', 'e2e-p6');
      const presign = await presignFor(token, PRESIGN_BODY);

      const res = await app.http
        .post(`/api/v1/professionals/me/portfolio/${presign.media_id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(200);

      expect(res.body.version).toBe(2);
      expect(res.body.portfolio).toHaveLength(1);
      expect(res.body.portfolio[0]).toMatchObject({
        id: presign.media_id,
        purpose: 'PORTFOLIO',
        media_type: 'IMAGE',
        url: expect.stringContaining(presign.s3_key),
        sort_order: 0,
      });
      const rows = await db.query(
        `SELECT status FROM media.files WHERE id = $1`,
        [presign.media_id],
      );
      expect(rows[0].status).toBe('READY');
    });

    it('P7 ligne inconnue/d’un autre pro → 404 media_not_found, version inchangée', async () => {
      const token = await seedPro('66040108', 'e2e-p7');

      const res = await app.http
        .post(`/api/v1/professionals/me/portfolio/${randomUUID()}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(404);

      expect(res.body.code).toBe('media_not_found');
      const me = await app.http
        .get('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.version).toBe(1);
    });

    it('P8 objet absent du bucket → 410 media_not_uploaded', async () => {
      const token = await seedPro('66040109', 'e2e-p8');
      const presign = await presignFor(token, PRESIGN_BODY);
      app.storage.markMissing(presign.s3_key);

      const res = await app.http
        .post(`/api/v1/professionals/me/portfolio/${presign.media_id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(410);

      expect(res.body.code).toBe('media_not_uploaded');
    });

    it('P9 taille réelle > max → 422 media_invalid, ligne FAILED', async () => {
      const token = await seedPro('66040110', 'e2e-p9');
      const presign = await presignFor(token, PRESIGN_BODY);
      app.storage.overrideHead(presign.s3_key, {
        size_bytes: 30 * 1024 * 1024,
        mime_type: 'image/jpeg',
      });

      const res = await app.http
        .post(`/api/v1/professionals/me/portfolio/${presign.media_id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(422);

      expect(res.body.code).toBe('media_invalid');
      const rows = await db.query(
        `SELECT status FROM media.files WHERE id = $1`,
        [presign.media_id],
      );
      expect(rows[0].status).toBe('FAILED');
    });

    it('P10 version obsolète → 409 version_conflict, pas de READY', async () => {
      const token = await seedPro('66040111', 'e2e-p10');
      const presign = await presignFor(token, PRESIGN_BODY);

      const res = await app.http
        .post(`/api/v1/professionals/me/portfolio/${presign.media_id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 42 })
        .expect(409);

      expect(res.body.code).toBe('version_conflict');
      const rows = await db.query(
        `SELECT status FROM media.files WHERE id = $1`,
        [presign.media_id],
      );
      expect(rows[0].status).toBe('PROCESSING');
    });
  });

  describe('P11-UPDATE — PUT /professionals/me/portfolio/:id', () => {
    it('P11 200 → purpose remplacé, séquence contiguë (1 item → sort_order 0)', async () => {
      const token = await seedPro('66040112', 'e2e-p11');
      const presign = await presignFor(token, PRESIGN_BODY);
      await app.http
        .post(`/api/v1/professionals/me/portfolio/${presign.media_id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(200);

      const res = await app.http
        .put(`/api/v1/professionals/me/portfolio/${presign.media_id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 2, sort_order: 5, purpose: 'BEFORE_AFTER' })
        .expect(200);

      expect(res.body.version).toBe(3);
      const item = res.body.portfolio.find(
        (p: { id: string }) => p.id === presign.media_id,
      );
      expect(item).toMatchObject({ sort_order: 0, purpose: 'BEFORE_AFTER' });
    });

    it('P11b item inconnu → 404 media_not_found', async () => {
      const token = await seedPro('66040113', 'e2e-p11b');

      const res = await app.http
        .put(`/api/v1/professionals/me/portfolio/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1, sort_order: 1 })
        .expect(404);

      expect(res.body.code).toBe('media_not_found');
    });
  });

  describe('P12-DELETE — DELETE /professionals/me/portfolio/:id', () => {
    it('P12 200 → retiré de la vitrine, objet S3 supprimé, soft delete', async () => {
      const token = await seedPro('66040114', 'e2e-p12');
      const presign = await presignFor(token, PRESIGN_BODY);
      await app.http
        .post(`/api/v1/professionals/me/portfolio/${presign.media_id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(200);

      const res = await app.http
        .delete(`/api/v1/professionals/me/portfolio/${presign.media_id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 2 })
        .expect(200);

      expect(res.body.version).toBe(3);
      expect(res.body.portfolio).toEqual([]);
      expect(app.storage.deletedKeys).toContain(presign.s3_key);
      const rows = await db.query(
        `SELECT deleted_at FROM media.files WHERE id = $1`,
        [presign.media_id],
      );
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('P13 item inconnu → 404 media_not_found, aucun objet supprimé', async () => {
      const token = await seedPro('66040115', 'e2e-p13');
      const deletedBefore = [...app.storage.deletedKeys];

      const res = await app.http
        .delete(`/api/v1/professionals/me/portfolio/${randomUUID()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(404);

      expect(res.body.code).toBe('media_not_found');
      expect(app.storage.deletedKeys).toEqual(deletedBefore);
    });
  });

  describe('P14-LIST — GET /professionals/me/portfolio', () => {
    it('P14 pagination offset : total, tri sort_order, page/limit', async () => {
      const token = await seedPro('66040116', 'e2e-p14');
      const a = await presignFor(token, PRESIGN_BODY);
      await app.http
        .post(`/api/v1/professionals/me/portfolio/${a.media_id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 1 })
        .expect(200);
      const b = await presignFor(token, { ...PRESIGN_BODY, size_bytes: 4096 });
      await app.http
        .post(`/api/v1/professionals/me/portfolio/${b.media_id}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 2 })
        .expect(200);
      await app.http
        .put(`/api/v1/professionals/me/portfolio/${a.media_id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 3, sort_order: 1 })
        .expect(200);

      const page1 = await app.http
        .get('/api/v1/professionals/me/portfolio?page=1&limit=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(page1.body.total).toBe(2);
      expect(page1.body.items).toHaveLength(1);
      expect(page1.body.items[0].id).toBe(b.media_id);

      const page2 = await app.http
        .get('/api/v1/professionals/me/portfolio?page=2&limit=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.items[0].id).toBe(a.media_id);

      const all = await app.http
        .get('/api/v1/professionals/me/portfolio')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(all.body.items).toHaveLength(2);
      expect(all.body.items[0]).toMatchObject({ sort_order: 0, purpose: 'PORTFOLIO' });
      expect(all.body.items[1]).toMatchObject({ sort_order: 1, purpose: 'PORTFOLIO' });
    });
  });
});
