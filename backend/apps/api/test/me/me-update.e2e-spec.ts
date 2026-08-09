/**
 * TCHATCHA — Suite E2E lot 6.3.2 (docs/34-cadrage-users-lot-6-3-2.md §5, U1–U8).
 * PUT /api/v1/me : remplacement de l'identité, version optimiste, email unique.
 * Exécution : npx nx e2e api — base isolée (E2E_DATABASE_URL), SMS espionné.
 */
import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
import { User, UserStatus } from '../../src/modules/auth/domain/entities/user.entity';

interface AuthPair {
  access_token: string;
  refresh_token: string;
}

describe('Lot 6.3.2 — E2E PUT /me (34 §5 U1–U8)', () => {
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
      SELECT id FROM users.users WHERE phone LIKE '660200%'
    )`);
    await db.query(`DELETE FROM authz.refresh_tokens WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660200%'
    )`);
    await db.query(`DELETE FROM authz.otp_codes WHERE phone LIKE '660200%'`);
    await db.query(`DELETE FROM pros.locations WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '660200%'
      )
    )`);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660200%'
    )`);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660200%'
    )`);
    await db.query(`DELETE FROM users.users WHERE phone LIKE '660200%'`);
  }

  /** Insère directement un compte ACTIF + rôle CLIENT (évite le cooldown OTP). */
  async function seedActiveUser(
    phone: string,
    opts: { email?: string | null } = {},
  ): Promise<string> {
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        country_code: 'BJ',
        phone,
        email: opts.email ?? null,
        password_hash: '',
        full_name: `Profil ${phone}`,
        status: UserStatus.ACTIVE,
        flags: {},
      }),
    );
    await db.query(
      `INSERT INTO users.user_roles (user_id, role, granted_at) VALUES ($1, $2, now())`,
      [user.id, 'CLIENT'],
    );
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

  function putMe(token: string, body: Record<string, unknown>) {
    return app.http
      .put('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  describe('U1-SUCCES — remplacement complet', () => {
    it('PUT 200 → champs modifiés + version incrémentée, GET reflète', async () => {
      await seedActiveUser('66020001');
      const { access_token } = await loginFor('66020001', 'e2e-put-u1');

      const res = await putMe(access_token, {
        full_name: 'Kossi Agbo',
        locale: 'en',
        email: 'kossi@exemple.bj',
        avatar_url: 'https://cdn.example/a.png',
        version: 1,
      }).expect(200);
      expect(res.body.full_name).toBe('Kossi Agbo');
      expect(res.body.locale).toBe('en');
      expect(res.body.email).toBe('kossi@exemple.bj');
      expect(res.body.avatar_url).toBe('https://cdn.example/a.png');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.version).toBe(2);

      const reflet = await app.http
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);
      expect(reflet.body.full_name).toBe('Kossi Agbo');
      expect(reflet.body.locale).toBe('en');
      expect(reflet.body.email).toBe('kossi@exemple.bj');
      expect(reflet.body.version).toBe(2);
    });
  });

  describe('U1B-EFFACE — email/avatar null', () => {
    it('PUT email null → email effacé (bump version)', async () => {
      await seedActiveUser('66020002', { email: 'old@exemple.bj' });
      const { access_token } = await loginFor('66020002', 'e2e-put-u1b');

      const res = await putMe(access_token, {
        full_name: 'Aïcha Sossou',
        locale: 'fr',
        email: null,
        avatar_url: null,
        version: 1,
      }).expect(200);
      expect(res.body.email).toBeNull();
      expect(res.body.avatar_url).toBeNull();
      expect(res.body.version).toBe(2);
    });
  });

  describe('U2-AUTH — sans Bearer', () => {
    it('PUT /me sans header → 401 unauthorized', async () => {
      const res = await app.http
        .put('/api/v1/me')
        .send({ full_name: 'X', locale: 'fr', version: 1 })
        .expect(401);
      expect(res.body.code).toBe('unauthorized');
    });
  });

  describe('U3-SUSPEND — compte SUSPENDED', () => {
    it('user SUSPENDED → 403 account_locked', async () => {
      const uid = await seedActiveUser('66020003');
      const { access_token } = await loginFor('66020003', 'e2e-put-u3');
      await db.query(`UPDATE users.users SET status = 'SUSPENDED' WHERE id = $1`, [uid]);

      const res = await putMe(access_token, {
        full_name: 'Kossi Agbo',
        locale: 'fr',
        version: 1,
      }).expect(403);
      expect(res.body.code).toBe('account_locked');
    });
  });

  describe('U4-RGPD — compte anonymisé', () => {
    it('user anonymized_at → 403 resource_unavailable', async () => {
      const uid = await seedActiveUser('66020004');
      const { access_token } = await loginFor('66020004', 'e2e-put-u4');
      await db.query(
        `UPDATE users.users SET anonymized_at = now() WHERE id = $1`,
        [uid],
      );

      const res = await putMe(access_token, {
        full_name: 'Kossi Agbo',
        locale: 'fr',
        version: 1,
      }).expect(403);
      expect(res.body.code).toBe('resource_unavailable');
    });
  });

  describe('U5-EMAILDUP — email déjà porté', () => {
    it('PUT email d’un autre compte → 409 email_already_registered', async () => {
      await seedActiveUser('66020005', { email: 'partage@exemple.bj' });
      await seedActiveUser('66020006');
      const { access_token } = await loginFor('66020006', 'e2e-put-u5');

      const res = await putMe(access_token, {
        full_name: 'Kossi Agbo',
        locale: 'fr',
        email: 'partage@exemple.bj',
        version: 1,
      }).expect(409);
      expect(res.body.code).toBe('email_already_registered');
    });
  });

  describe('U6-STALE — version obsolète', () => {
    it('PUT avec version -1 → 409 version_conflict (aucune écriture)', async () => {
      await seedActiveUser('66020007');
      const { access_token } = await loginFor('66020007', 'e2e-put-u6');

      await putMe(access_token, {
        full_name: 'Premier nom',
        locale: 'fr',
        version: 1,
      }).expect(200);

      const res = await putMe(access_token, {
        full_name: 'Deuxième nom',
        locale: 'fr',
        version: 1,
      }).expect(409);
      expect(res.body.code).toBe('version_conflict');

      const reflet = await app.http
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);
      expect(reflet.body.full_name).toBe('Premier nom');
      expect(reflet.body.version).toBe(2);
    });
  });

  describe('U7-INTERDIT — champ sensible', () => {
    it('PUT avec phone dans le body → 400 (forbidNonWhitelisted)', async () => {
      await seedActiveUser('66020008');
      const { access_token } = await loginFor('66020008', 'e2e-put-u7');

      const res = await putMe(access_token, {
        full_name: 'Kossi Agbo',
        locale: 'fr',
        phone: '66020008',
        version: 1,
      }).expect(400);
      expect(res.body.message).toBeTruthy();
    });
  });

  describe('U8-INVALIDE — email malformé', () => {
    it('PUT email invalide → 400 validation', async () => {
      await seedActiveUser('66020009');
      const { access_token } = await loginFor('66020009', 'e2e-put-u8');

      const res = await putMe(access_token, {
        full_name: 'Kossi Agbo',
        locale: 'fr',
        email: 'pas-un-email',
        version: 1,
      }).expect(400);
      expect(res.body.message).toBeTruthy();
    });
  });
});