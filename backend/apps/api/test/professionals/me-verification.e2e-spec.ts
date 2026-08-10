/**
 * TCHATCHA — Suite E2E lot 6.3.5b-1 (docs/38 §4.2, V1–V10).
 * Dossier de vérification du pro : presign DOCUMENT (bucket privé, pdf),
 * soumission POST /professionals/me/verifications (PENDING + tâche admin),
 * GET /professionals/me/verification. Storage S3 remplacé par InMemoryStorage
 * (aucun réseau). Téléphones de test : 660402*.
 * Exécution : npx nx e2e api --runInBand --testPathPattern="me-verification".
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

describe('Lot 6.3.5b-1 — E2E dossier de vérification (38 §4.2 V1–V10)', () => {
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
    await db.query(`DELETE FROM admin.validation_tasks WHERE entity_type = 'PRO_VERIFICATION'
      AND entity_id IN (SELECT id FROM pros.verifications WHERE professional_id IN (
        SELECT id FROM pros.profiles WHERE user_id IN (
          SELECT id FROM users.users WHERE phone LIKE '660402%'
        )
      ))`);
    await db.query(`DELETE FROM pros.verifications WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660402%'
      )
    )`);
    await db.query(`DELETE FROM media.files WHERE owner_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660402%'
      )
    )`);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660402%'
    )`);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660402%'
    )`);
    await db.query(`DELETE FROM users.users WHERE phone LIKE '660402%'`);
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

  async function seedProfile(userId: string): Promise<string> {
    const profileId = randomUUID();
    await db.query(
      `INSERT INTO pros.profiles (
         id, user_id, business_name, headline, description, experience_years,
         employees_count, status, verified, verified_at, rating_avg,
         rating_count, trust_score, completed_jobs, response_time_min,
         min_price, currency, website, social_links, country_code, version,
         created_at, updated_at
       ) VALUES (
         $1, $2, 'Plomberie SOS', 'Plombier 15 ans Cotonou',
         'Dépannage rapide et devis gratuit', 15, 3, 'ACTIVE', false, null,
         4.5, 12, 0.82, 34, 30, 5000, 'XOF', null, null, 'BJ', 1,
         now(), now()
       )`,
      [profileId, userId],
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

  async function presignDoc(token: string, body: Record<string, unknown>): Promise<PresignResult> {
    const res = await app.http
      .post('/api/v1/media/presign')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    return res.body as PresignResult;
  }

  async function submitVerification(
    token: string,
    items: Array<{ type: string; media_id: string }>,
  ): Promise<{ verifications: Array<{ id: string; type: string; status: string }> }> {
    const res = await app.http
      .post('/api/v1/professionals/me/verifications')
      .set('Authorization', `Bearer ${token}`)
      .send({ items })
      .expect(201);
    return res.body;
  }

  const DOC_BODY = {
    purpose: 'DOCUMENT',
    mime_type: 'image/jpeg',
    size_bytes: 2048,
  };

  describe('V1-V2 — presign DOCUMENT (RF-VR-01)', () => {
    it('V1 201 → bucket privé + clé RF-MD-05 + URL présignée', async () => {
      const token = await seedPro('66040201', 'e2e-v1');

      const res = await app.http
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${token}`)
        .send(DOC_BODY)
        .expect(201);

      expect(res.body.s3_key).toMatch(
        /^BJ\/PROFESSIONAL\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/u,
      );
      expect(res.body.expires_in).toBe(900);
      expect(app.storage.lastPresignInput?.bucket).toBe('private');
      expect(app.storage.lastPresignInput?.contentType).toBe('image/jpeg');
      const rows = await db.query(
        `SELECT url FROM media.files WHERE id = $1`,
        [res.body.media_id],
      );
      expect(rows[0].url).toMatch(/^s3:\/\/private\//u);
    });

    it('V2a pdf accepté → 201 (media_type DOCUMENT)', async () => {
      const token = await seedPro('66040202', 'e2e-v2a');
      const presign = await presignDoc(token, {
        ...DOC_BODY,
        mime_type: 'application/pdf',
      });
      const rows = await db.query(
        `SELECT media_type, mime_type FROM media.files WHERE id = $1`,
        [presign.media_id],
      );
      expect(rows[0].media_type).toBe('DOCUMENT');
      expect(rows[0].mime_type).toBe('application/pdf');
      expect(presign.s3_key).toMatch(/\.pdf$/u);
    });

    it('V2b mime hors whitelist DOCUMENT → 422 media_type_not_supported', async () => {
      const token = await seedPro('66040203', 'e2e-v2b');
      const res = await app.http
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...DOC_BODY, mime_type: 'audio/mpeg' })
        .expect(422);
      expect(res.body.code).toBe('media_type_not_supported');
    });

    it('V2c taille > 10 Mo → 422 media_size_exceeded', async () => {
      const token = await seedPro('66040204', 'e2e-v2c');
      const res = await app.http
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...DOC_BODY, size_bytes: 11 * 1024 * 1024 })
        .expect(422);
      expect(res.body.code).toBe('media_size_exceeded');
    });
  });

  describe('V3-V8 — soumission (RF-VR-03/04/05)', () => {
    it('V3 sans PUT (objet absent) → 410 media_not_uploaded', async () => {
      const token = await seedPro('66040205', 'e2e-v3');
      const presign = await presignDoc(token, DOC_BODY);
      app.storage.markMissing(presign.s3_key);

      const res = await app.http
        .post('/api/v1/professionals/me/verifications')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ type: 'NATIONAL_ID', media_id: presign.media_id }] })
        .expect(410);

      expect(res.body.code).toBe('media_not_uploaded');
    });

    it('V4 201 → ligne PENDING + média READY + tâche admin créée', async () => {
      const token = await seedPro('66040206', 'e2e-v4');
      const presign = await presignDoc(token, DOC_BODY);

      const body = await submitVerification(token, [
        { type: 'NATIONAL_ID', media_id: presign.media_id },
      ]);

      expect(body.verifications).toHaveLength(1);
      expect(body.verifications[0]).toMatchObject({
        type: 'NATIONAL_ID',
        status: 'PENDING',
      });
      const mediaRows = await db.query(
        `SELECT status FROM media.files WHERE id = $1`,
        [presign.media_id],
      );
      expect(mediaRows[0].status).toBe('READY');
      const taskRows = await db.query(
        `SELECT entity_type, entity_id, status FROM admin.validation_tasks
          WHERE entity_type = 'PRO_VERIFICATION' AND entity_id = $1`,
        [body.verifications[0].id],
      );
      expect(taskRows).toHaveLength(1);
      expect(taskRows[0].status).toBe('PENDING');
    });

    it('V5 doublon PENDING → 409 verification_pending', async () => {
      const token = await seedPro('66040207', 'e2e-v5');
      const doc1 = await presignDoc(token, DOC_BODY);
      const doc2 = await presignDoc(token, DOC_BODY);
      await submitVerification(token, [
        { type: 'SELFIE', media_id: doc1.media_id },
      ]);

      const res = await app.http
        .post('/api/v1/professionals/me/verifications')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ type: 'SELFIE', media_id: doc2.media_id }] })
        .expect(409);

      expect(res.body.code).toBe('verification_pending');
    });

    it('V6 doublon APPROVED → 409 verification_already_approved', async () => {
      const token = await seedPro('66040208', 'e2e-v6');
      const doc1 = await presignDoc(token, DOC_BODY);
      const doc2 = await presignDoc(token, DOC_BODY);
      const body = await submitVerification(token, [
        { type: 'NATIONAL_ID', media_id: doc1.media_id },
      ]);
      await db.query(
        `UPDATE pros.verifications SET status = 'APPROVED',
           reviewed_by = (SELECT id FROM users.users LIMIT 1), reviewed_at = now()
         WHERE id = $1`,
        [body.verifications[0].id],
      );

      const res = await app.http
        .post('/api/v1/professionals/me/verifications')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ type: 'NATIONAL_ID', media_id: doc2.media_id }] })
        .expect(409);

      expect(res.body.code).toBe('verification_already_approved');
    });

    it('V7 ligne REJECTED → réactivation (nouveau média, PENDING, tâche admin)', async () => {
      const token = await seedPro('66040209', 'e2e-v7');
      const doc1 = await presignDoc(token, DOC_BODY);
      const doc2 = await presignDoc(token, DOC_BODY);
      const body = await submitVerification(token, [
        { type: 'NATIONAL_ID', media_id: doc1.media_id },
      ]);
      await db.query(
        `UPDATE pros.verifications SET status = 'REJECTED',
           reviewed_by = (SELECT id FROM users.users LIMIT 1),
           reviewed_at = now(), note = 'Illisible' WHERE id = $1`,
        [body.verifications[0].id],
      );

      const res = await app.http
        .post('/api/v1/professionals/me/verifications')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ type: 'NATIONAL_ID', media_id: doc2.media_id }] })
        .expect(201);

      expect(res.body.verifications[0].id).toBe(body.verifications[0].id);
      expect(res.body.verifications[0].status).toBe('PENDING');
      const rows = await db.query(
        `SELECT media_id, status, note FROM pros.verifications WHERE id = $1`,
        [body.verifications[0].id],
      );
      expect(rows[0].media_id).toBe(doc2.media_id);
      expect(rows[0].status).toBe('PENDING');
      expect(rows[0].note).toBeNull();
      const taskRows = await db.query(
        `SELECT status, decided_at FROM admin.validation_tasks WHERE entity_id = $1`,
        [body.verifications[0].id],
      );
      expect(taskRows[0].status).toBe('PENDING');
      expect(taskRows[0].decided_at).toBeNull();
    });

    it('V8 document d’un autre pro → 404 media_not_found', async () => {
      const tokenA = await seedPro('66040210', 'e2e-v8a');
      const tokenB = await seedPro('66040211', 'e2e-v8b');
      const docA = await presignDoc(tokenA, DOC_BODY);

      const res = await app.http
        .post('/api/v1/professionals/me/verifications')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ items: [{ type: 'NATIONAL_ID', media_id: docA.media_id }] })
        .expect(404);

      expect(res.body.code).toBe('media_not_found');
    });

    it('V8b client sans fiche → 404 professional_not_found', async () => {
      await seedUser('66040212', 'CLIENT');
      const { access_token } = await loginFor('66040212', 'e2e-v8b');
      const res = await app.http
        .post('/api/v1/professionals/me/verifications')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ items: [{ type: 'NATIONAL_ID', media_id: randomUUID() }] })
        .expect(404);
      expect(res.body.code).toBe('professional_not_found');
    });
  });

  describe('V9-V10 — GET dossier (RF-VR-06)', () => {
    it('V9 200 → projection PENDING/0 puis APPROVED/2 après approbation SQL', async () => {
      const token = await seedPro('66040213', 'e2e-v9');
      const docC = await presignDoc(token, DOC_BODY);
      const docS = await presignDoc(token, DOC_BODY);
      await submitVerification(token, [
        { type: 'NATIONAL_ID', media_id: docC.media_id },
        { type: 'SELFIE', media_id: docS.media_id },
      ]);

      const res1 = await app.http
        .get('/api/v1/professionals/me/verification')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res1.body.status).toBe('PENDING');
      expect(res1.body.verification_level).toBe(0);
      expect(res1.body.items).toHaveLength(2);
      expect(res1.body.items[0]).toMatchObject({
        type: 'NATIONAL_ID',
        status: 'PENDING',
      });
      expect(res1.body.items[0].media_id).toBe(docC.media_id);
      expect(res1.body.items[0].s3_key).toBeUndefined();

      await db.query(
        `UPDATE pros.verifications SET status = 'APPROVED' WHERE professional_id IN (
           SELECT id FROM pros.profiles WHERE user_id IN (
             SELECT id FROM users.users WHERE phone = '66040213'
           )
         )`,
      );
      const res2 = await app.http
        .get('/api/v1/professionals/me/verification')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res2.body.status).toBe('APPROVED');
      expect(res2.body.verification_level).toBe(2);
    });

    it('V10 GET sans fiche pro → 404', async () => {
      await seedUser('66040214', 'CLIENT');
      const { access_token } = await loginFor('66040214', 'e2e-v10');
      const res = await app.http
        .get('/api/v1/professionals/me/verification')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(404);
      expect(res.body.code).toBe('professional_not_found');
    });
  });
});
