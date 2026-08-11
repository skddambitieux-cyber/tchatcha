/**
 * TCHATCHA — Suite E2E lot 6.2 (docs/29-tests-auth.md §4, G1–G5).
 * Exécution : npx nx e2e api — base isolée obligatoire (E2E_DATABASE_URL),
 * SMS espionné pour capter les codes OTP, app Nest complète via supertest.
 * Préfixe : /api/v1 (main.ts).
 *
 * Contrainte cooldown : 45 s par numéro (tous purposes confondus) → chaque
 * scénario OTP utilise un numéro distinct ; seul G1-DUP attend 46 s pour
 * atteindre la règle métier 409.
 */
import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
import { User, UserStatus } from '../../src/modules/auth/domain/entities/user.entity';

interface AuthPair {
  access_token: string;
  refresh_token: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('Lot 6.2 — E2E auth (29 §4 G1–G5)', () => {
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

  /** Purge les données de test (idempotence entre runs sur base partagée). */
  async function cleanupTestData(): Promise<void> {
    await db.query(`DELETE FROM users.consents WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660000%'
    )`);
    await db.query(`DELETE FROM authz.refresh_tokens WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660000%'
    )`);
    await db.query(`DELETE FROM authz.otp_codes WHERE phone LIKE '660000%'`);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '660000%'
    )`);
    await db.query(`DELETE FROM users.users WHERE phone LIKE '660000%'`);
  }

  /** Insère directement un compte ACTIF (évite les 45 s de cooldown). */
  async function seedActiveUser(phone: string): Promise<void> {
    await db.getRepository(User).save(
      db.getRepository(User).create({
        country_code: 'BJ',
        phone,
        email: null,
        password_hash: '',
        full_name: `User ${phone}`,
        status: UserStatus.ACTIVE,
        flags: {},
      }),
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

  describe('G1 — Inscription complète (REGISTER)', () => {
    const PHONE = '66000001';

    it('G1-OTP-REQ: request BJ → 202, expires_at, AUCUN code', async () => {
      const res = await app.http
        .post('/api/v1/auth/otp/request')
        .send({ country_code: 'BJ', phone: PHONE, purpose: 'REGISTER' })
        .expect(202);
      expect(res.body.message).toBe('otp_sent');
      expect(typeof res.body.expires_at).toBe('string');
      expect(JSON.stringify(res.body)).not.toContain('"code"');
    });

    it('G1-OTP-VER: verify REGISTER code capté → 200 otp_verified, pas de token', async () => {
      const code = app.sms.lastCode('BJ', PHONE);
      const res = await app.http
        .post('/api/v1/auth/otp/verify')
        .send({ country_code: 'BJ', phone: PHONE, code, purpose: 'REGISTER' })
        .expect(200);
      expect(res.body.status).toBe('otp_verified');
      expect(res.body).not.toHaveProperty('access_token');
    });

    it('G1-REG: register CLIENT → 201 tokens + user ACTIVE', async () => {
      const res = await app.http
        .post('/api/v1/auth/register')
        .send({
          country_code: 'BJ',
          phone: PHONE,
          full_name: 'Aïcha Sossou',
          role: 'CLIENT',
          consents: { cgv: true, privacy: true },
          device: { session_id: 'e2e-g1', ip: '127.0.0.1' },
        })
        .expect(201);
      expect(res.body.access_token).toBeTruthy();
      expect(res.body.refresh_token).toBeTruthy();
      expect(res.body.user).toMatchObject({ status: 'ACTIVE', role: 'CLIENT' });
    });

    it('G1-DUP: nouvel OTP REGISTER après cooldown → 409 phone_already_registered', async () => {
      await sleep(46_000); // laisse expirer le cooldown 45 s du numéro
      const res = await app.http
        .post('/api/v1/auth/otp/request')
        .send({ country_code: 'BJ', phone: PHONE, purpose: 'REGISTER' })
        .expect(409);
      expect(res.body.code).toBe('phone_already_registered');
    });
  });

  describe('G2 — Connexion (LOGIN)', () => {
    beforeAll(async () => {
      await seedActiveUser('66000002'); // verify LOGIN
      await seedActiveUser('66000003'); // alias /auth/login
      await seedActiveUser('66000004'); // mauvais code
    });

    it('G2-OTP-LOGIN: verify LOGIN → 200 tokens + user', async () => {
      await app.http
        .post('/api/v1/auth/otp/request')
        .send({ country_code: 'BJ', phone: '66000002', purpose: 'LOGIN' })
        .expect(202);
      const code = app.sms.lastCode('BJ', '66000002');
      const res = await app.http
        .post('/api/v1/auth/otp/verify')
        .send({ country_code: 'BJ', phone: '66000002', code, purpose: 'LOGIN' })
        .expect(200);
      expect(res.body.access_token).toBeTruthy();
      expect(res.body.user.id).toBeTruthy();
    });

    it('alias /auth/login → 200 tokens + user', async () => {
      const pair = await loginFor('66000003', 'e2e-g2-b');
      expect(pair.access_token).toBeTruthy();
      expect(pair.refresh_token).toBeTruthy();
    });

    it('G2-BADCODE: code faux → 401 otp_invalid + attempts_left', async () => {
      await app.http
        .post('/api/v1/auth/otp/request')
        .send({ country_code: 'BJ', phone: '66000004', purpose: 'LOGIN' })
        .expect(202);
      const res = await app.http
        .post('/api/v1/auth/login')
        .send({ country_code: 'BJ', phone: '66000004', code: '000000' })
        .expect(401);
      expect(res.body.code).toBe('otp_invalid');
      expect(res.body.details[0].meta.attempts_left).toBeGreaterThanOrEqual(0);
    });
  });

  describe('G3 — Rotation refresh', () => {
    beforeAll(async () => {
      await seedActiveUser('66000005');
      await seedActiveUser('66000006');
      await seedActiveUser('66000007');
    });

    it('G3-REF-OK: /auth/refresh → 200 nouveaux tokens, ancien ≠ nouveau', async () => {
      const { refresh_token } = await loginFor('66000005', 'e2e-g3-r');
      const res = await app.http
        .post('/api/v1/auth/refresh')
        .send({ refresh_token, device: { session_id: 'e2e-g3-r' } })
        .expect(200);
      expect(res.body.access_token).toBeTruthy();
      expect(res.body.refresh_token).not.toBe(refresh_token);
    });

    it('G3-REF-REUSE: rejouer l’ancien refresh → 401 refresh_reused', async () => {
      const { refresh_token } = await loginFor('66000006', 'e2e-g3-s');
      await app.http
        .post('/api/v1/auth/refresh')
        .send({ refresh_token, device: { session_id: 'e2e-g3-s' } })
        .expect(200);
      const res = await app.http
        .post('/api/v1/auth/refresh')
        .send({ refresh_token, device: { session_id: 'e2e-g3-s' } })
        .expect(401);
      expect(res.body.code).toBe('refresh_reused');
    });

    it('G3-REF-DEVICE: device différent → 401 invalid_device', async () => {
      const { refresh_token } = await loginFor('66000007', 'e2e-g3-t');
      const res = await app.http
        .post('/api/v1/auth/refresh')
        .send({ refresh_token, device: { session_id: 'AUTRE-CANAL' } })
        .expect(401);
      expect(res.body.code).toBe('invalid_device');
    });
  });

  describe('G4 — Déconnexion', () => {
    beforeAll(async () => {
      await seedActiveUser('66000008');
      await seedActiveUser('66000009');
      await seedActiveUser('66000010');
    });

    it('G4-LOG: logout → 204 ; refresh suivant → 401', async () => {
      const { access_token, refresh_token } = await loginFor('66000008', 'e2e-g4-a');
      await app.http
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ refresh_token })
        .expect(204);
      const res = await app.http
        .post('/api/v1/auth/refresh')
        .send({ refresh_token })
        .expect(401);
      expect(['refresh_reused', 'unauthorized']).toContain(res.body.code);
    });

    it('G4-LOG-2: logout deux fois → 204 (idempotent)', async () => {
      const { access_token, refresh_token } = await loginFor('66000009', 'e2e-g4-b');
      await app.http
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ refresh_token })
        .expect(204);
      await app.http
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ refresh_token })
        .expect(204);
    });

    it('G4-ALL: logout-all → 204', async () => {
      const { access_token } = await loginFor('66000010', 'e2e-g4-c');
      await app.http
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(204);
    });

    it('G4-NO-BEARER: logout sans Bearer → 401', async () => {
      await app.http
        .post('/api/v1/auth/logout')
        .send({ refresh_token: 'anything' })
        .expect(401);
    });
  });

  describe('G5 — Rate limiting & sécurité', () => {
    it('G5-COOL: 2ᵉ otp/request < 45 s → 429 otp_cooldown + Retry-After', async () => {
      await app.http
        .post('/api/v1/auth/otp/request')
        .send({ country_code: 'BJ', phone: '66000011', purpose: 'LOGIN' })
        .expect(202);
      const res = await app.http
        .post('/api/v1/auth/otp/request')
        .send({ country_code: 'BJ', phone: '66000011', purpose: 'LOGIN' })
        .expect(429);
      expect(res.body.code).toBe('otp_cooldown');
      expect(res.headers['retry-after']).toBeDefined();
    });

    it('G5-NO-LEAK: aucune réponse ne fuit un code OTP', async () => {
      const res = await app.http
        .post('/api/v1/auth/otp/request')
        .send({ country_code: 'BJ', phone: '66000012', purpose: 'LOGIN' })
        .expect(202);
      expect(JSON.stringify(res.body)).not.toMatch(/"code"\s*:/u);
    });

    it('G5-BADFIELD: body invalide → 400 validation', async () => {
      const res = await app.http
        .post('/api/v1/auth/otp/request')
        .send({ country_code: 'XX', phone: '123', purpose: 'REGISTER' })
        .expect(400);
      expect(res.body.message).toBeTruthy();
    });
  });
});
