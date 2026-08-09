/**
 * TCHATCHA — Suite E2E lot 6.3.1 (docs/33-tests-users.md §4, M1–M8).
 * GET /api/v1/me : profil du compte connecté (Bearer access JWT).
 * Exécution : npx nx e2e api — base isolée (E2E_DATABASE_URL), SMS espionné.
 */
import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { DataSource } from 'typeorm';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../test-app';
import { User, UserStatus } from '../../src/modules/auth/domain/entities/user.entity';

interface AuthPair {
  access_token: string;
  refresh_token: string;
}

describe('Lot 6.3.1 — E2E GET /me (33 §4 M1–M8)', () => {
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
    await db.query(`DELETE FROM users.consents WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660100%'
    )`);
    await db.query(`DELETE FROM authz.refresh_tokens WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660100%'
    )`);
    await db.query(`DELETE FROM authz.otp_codes WHERE phone LIKE '660100%'`);
    await db.query(`DELETE FROM pros.locations WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660100%'
      )
    )`);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660100%'
    )`);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660100%'
    )`);
    await db.query(`DELETE FROM users.users WHERE phone LIKE '660100%'`);
  }

  /** Insère directement un compte ACTIF + rôle (évite le cooldown OTP). */
  async function seedActiveUser(
    phone: string,
    opts: { role: string; flags?: Record<string, unknown> } = { role: 'CLIENT' },
  ): Promise<string> {
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        country_code: 'BJ',
        phone,
        email: null,
        password_hash: '',
        full_name: `Profil ${phone}`,
        status: UserStatus.ACTIVE,
        flags: opts.flags ?? {},
      }),
    );
    await db.query(
      `INSERT INTO users.user_roles (user_id, role, granted_at) VALUES ($1, $2, now())`,
      [user.id, opts.role],
    );
    if (opts.role === 'PROFESSIONAL') {
      await db.query(
        `INSERT INTO pros.profiles
           (id, user_id, status, verified, currency, country_code, rating_avg, rating_count, trust_score, completed_jobs)
         VALUES (gen_random_uuid(), $1, 'PENDING_VERIFICATION', false, 'XOF', 'BJ', 0, 0, 0, 0)`,
        [user.id],
      );
    }
    return user.id;
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

  describe('M1-LOGIN — CLIENT actif', () => {
    it('login CLIENT puis GET /me → 200 profil complet, pas de sous-objet pro', async () => {
      await seedActiveUser('66010001', { role: 'CLIENT' });
      const { access_token } = await loginFor('66010001', 'e2e-me-m1');

      const res = await app.http
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);
      expect(res.body.id).toBeTruthy();
      expect(res.body.full_name).toBe(`Profil 66010001`);
      expect(res.body.phone).toBe('66010001');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.roles).toEqual(['CLIENT']);
      expect(res.body.professional).toBeNull();
      expect(res.body.deliverer).toBeNull();
    });
  });

  describe('M2-PRO — PROFESSIONAL avec vitrine', () => {
    it('GET /me → 200 + objet professional (PENDING_VERIFICATION, rating 0)', async () => {
      await seedActiveUser('66010002', { role: 'PROFESSIONAL' });
      const { access_token } = await loginFor('66010002', 'e2e-me-m2');

      const res = await app.http
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);
      expect(res.body.professional).toMatchObject({
        status: 'PENDING_VERIFICATION',
        verification_status: 'UNVERIFIED',
        rating_avg: 0,
        rating_count: 0,
        trust_score: 0,
        completed_jobs: 0,
      });
      expect(res.body.professional.id).toBeTruthy();
    });
  });

  describe('M3-AUTH — sans Bearer', () => {
    it('GET /me sans header → 401 unauthorized', async () => {
      const res = await app.http.get('/api/v1/me').expect(401);
      expect(res.body.code).toBe('unauthorized');
    });
  });

  describe('M4-TOKENEXP — access expiré', () => {
    it('access token expiré (mock clock) → 401 token_expired', async () => {
      const secret = process.env.JWT_SECRET ?? 'test-secret';
      const expired = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000000', role: 'CLIENT' },
        secret,
        { expiresIn: '-10s' },
      );
      const res = await app.http
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
      expect(res.body.code).toBe('token_expired');
    });
  });

  describe('M5-FALS — token falsifié', () => {
    it('access token falsifié → 401 unauthorized', async () => {
      const res = await app.http
        .get('/api/v1/me')
        .set('Authorization', `Bearer abc.def.ghi`)
        .expect(401);
      expect(res.body.code).toBe('unauthorized');
    });
  });

  describe('M6-SUSPEND — compte SUSPENDED', () => {
    it('user SUSPENDED → 403 account_locked', async () => {
      const uid = await seedActiveUser('66010003', { role: 'CLIENT' });
      const { access_token } = await loginFor('66010003', 'e2e-me-m6');
      await db.query(`UPDATE users.users SET status = 'SUSPENDED' WHERE id = $1`, [uid]);

      const res = await app.http
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(403);
      expect(res.body.code).toBe('account_locked');
    });
  });

  describe('M7-RGPD — compte anonymisé', () => {
    it('user anonymized_at → 403 resource_unavailable', async () => {
      const uid = await seedActiveUser('66010004', { role: 'CLIENT' });
      const { access_token } = await loginFor('66010004', 'e2e-me-m7');
      await db.query(
        `UPDATE users.users SET anonymized_at = now() WHERE id = $1`,
        [uid],
      );

      const res = await app.http
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(403);
      expect(res.body.code).toBe('resource_unavailable');
    });
  });

  describe('M8-OWN2 — propriétaire du profil', () => {
    it('access d’un 2ᵉ user → /me retourne SES données, jamais un autre compte', async () => {
      await seedActiveUser('66010005', { role: 'CLIENT' });
      const second = await seedActiveUser('66010006', { role: 'CLIENT' });
      const { access_token } = await loginFor('66010006', 'e2e-me-m8');

      const res = await app.http
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);
      expect(res.body.id).toBe(second);
      expect(res.body.phone).toBe('66010006');
    });
  });
});