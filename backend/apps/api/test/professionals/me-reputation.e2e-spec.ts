import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { User, UserStatus } from '../../src/modules/auth/domain/entities/user.entity';
import { createTestApp } from '../test-app';

const PHONE_PREFIX = '660404';

describe('Lot 6.3.6 — GET /professionals/me/reputation (R1–R12)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
  });

  async function cleanup() {
    await db.query(`DELETE FROM pros.reputation WHERE professional_id IN (
      SELECT id FROM pros.profiles WHERE user_id IN (
        SELECT id FROM users.users WHERE phone LIKE '${PHONE_PREFIX}%'))`);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '${PHONE_PREFIX}%')`);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (
      SELECT id FROM users.users WHERE phone LIKE '${PHONE_PREFIX}%')`);
    await db.query(`DELETE FROM users.users WHERE phone LIKE '${PHONE_PREFIX}%'`);
  }

  async function seedUser(phone: string, role: 'CLIENT' | 'PROFESSIONAL') {
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        country_code: 'BJ',
        phone,
        email: null,
        password_hash: '',
        full_name: `Reputation ${phone}`,
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
    completedJobs = 3,
    status = 'ACTIVE',
  ) {
    const id = randomUUID();
    await db.query(
      `INSERT INTO pros.profiles
       (id, user_id, status, completed_jobs, currency, country_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'XOF', 'BJ', now(), now())`,
      [id, userId, status, completedJobs],
    );
    return id;
  }

  async function seedReputation(
    professionalId: string,
    overrides: { completedJobs?: number; nullable?: boolean; score?: number } = {},
  ) {
    const nullable = overrides.nullable ?? false;
    await db.query(
      `INSERT INTO pros.reputation
       (professional_id, completed_jobs, acceptance_rate, cancellation_rate,
        avg_response_min, punctuality_avg, avg_execution_days, disputes_count,
        seniority_days, verification_level, ai_factor, trust_score, trust_level,
        recomputed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 420, 2, 0.77, $8, 'HIGH',
        '2026-08-10T12:00:00.000Z', now(), now())`,
      [
        professionalId,
        overrides.completedJobs ?? 12,
        nullable ? null : 91.5,
        nullable ? null : 2.5,
        nullable ? null : 8,
        nullable ? null : 4.4,
        nullable ? null : 2.75,
        overrides.score ?? 4.25,
      ],
    );
  }

  async function login(phone: string, sessionId: string) {
    await app.http
      .post('/api/v1/auth/otp/request')
      .send({ country_code: 'BJ', phone, purpose: 'LOGIN' })
      .expect(202);
    const code = app.sms.lastCode('BJ', phone);
    const response = await app.http
      .post('/api/v1/auth/login')
      .send({ country_code: 'BJ', phone, code, device: { session_id: sessionId } })
      .expect(200);
    return response.body.access_token as string;
  }

  function get(token?: string) {
    const request = app.http.get('/api/v1/professionals/me/reputation');
    return token ? request.set('Authorization', `Bearer ${token}`) : request;
  }

  it('R1 rejects an unauthenticated request', () => get().expect(401));

  it('R2 rejects a client account', async () => {
    await seedUser('66040401', 'CLIENT');
    const token = await login('66040401', 'rep-r2');
    await get(token).expect(404);
  });

  it('R3 returns NOT_COMPUTED with the profile completed_jobs fallback', async () => {
    const userId = await seedUser('66040402', 'PROFESSIONAL');
    await seedProfile(userId, 3);
    const token = await login('66040402', 'rep-r3');
    const response = await get(token).expect(200);
    expect(response.body).toMatchObject({
      status: 'NOT_COMPUTED',
      score_visible: false,
      trust_score: null,
      trust_level: 'NEW',
      verification_level: 0,
      completed_jobs: 3,
      recomputed_at: null,
    });
  });

  it('R4 hides score and level before five reputation jobs', async () => {
    const userId = await seedUser('66040403', 'PROFESSIONAL');
    const profileId = await seedProfile(userId, 99);
    await seedReputation(profileId, { completedJobs: 4, score: 4.9 });
    const token = await login('66040403', 'rep-r4');
    const response = await get(token).expect(200);
    expect(response.body).toMatchObject({
      status: 'INSUFFICIENT_DATA',
      score_visible: false,
      trust_score: null,
      trust_level: 'NEW',
      completed_jobs: 4,
    });
  });

  it('R5–R6 exposes the row exactly, preserves nulls and never exposes ai_factor', async () => {
    const fullUserId = await seedUser('66040404', 'PROFESSIONAL');
    const fullProfileId = await seedProfile(fullUserId);
    await seedReputation(fullProfileId);
    const fullToken = await login('66040404', 'rep-r5');
    const full = await get(fullToken).expect(200);
    expect(full.body).toEqual({
      status: 'COMPUTED', score_visible: true, trust_score: 4.25,
      trust_level: 'HIGH', verification_level: 2, completed_jobs: 12,
      acceptance_rate: 91.5, cancellation_rate: 2.5, avg_response_min: 8,
      punctuality_avg: 4.4, avg_execution_days: 2.8, disputes_count: 1,
      seniority_days: 420, recomputed_at: '2026-08-10T12:00:00.000Z',
    });
    expect(full.body).not.toHaveProperty('ai_factor');

    const nullUserId = await seedUser('66040405', 'PROFESSIONAL');
    const nullProfileId = await seedProfile(nullUserId);
    await seedReputation(nullProfileId, { nullable: true });
    const nullToken = await login('66040405', 'rep-r6');
    const nullable = await get(nullToken).expect(200);
    expect(nullable.body).toMatchObject({
      acceptance_rate: null, cancellation_rate: null, avg_response_min: null,
      punctuality_avg: null, avg_execution_days: null,
    });
  });

  it('R7–R9 rejects locked, suspended-profile and anonymized owners', async () => {
    const lockedId = await seedUser('66040406', 'PROFESSIONAL');
    await seedProfile(lockedId);
    const lockedToken = await login('66040406', 'rep-r7');
    await db.query(`UPDATE users.users SET status = 'SUSPENDED' WHERE id = $1`, [lockedId]);
    await get(lockedToken).expect(403);

    const suspendedId = await seedUser('66040407', 'PROFESSIONAL');
    await seedProfile(suspendedId, 0, 'SUSPENDED');
    const suspendedToken = await login('66040407', 'rep-r8');
    await get(suspendedToken).expect(403);

    const anonymizedId = await seedUser('66040408', 'PROFESSIONAL');
    await seedProfile(anonymizedId);
    const anonymizedToken = await login('66040408', 'rep-r9');
    await db.query(`UPDATE users.users SET anonymized_at = now() WHERE id = $1`, [anonymizedId]);
    await get(anonymizedToken).expect(403);
  });

  it('R10 isolates owners', async () => {
    const firstId = await seedUser('66040409', 'PROFESSIONAL');
    const firstProfile = await seedProfile(firstId);
    await seedReputation(firstProfile, { score: 3.1 });
    const secondId = await seedUser('66040410', 'PROFESSIONAL');
    const secondProfile = await seedProfile(secondId);
    await seedReputation(secondProfile, { score: 4.8 });
    const firstToken = await login('66040409', 'rep-r10-a');
    const secondToken = await login('66040410', 'rep-r10-b');
    expect((await get(firstToken).expect(200)).body.trust_score).toBe(3.1);
    expect((await get(secondToken).expect(200)).body.trust_score).toBe(4.8);
  });

  it('R11–R12 reads the verification level and is strictly read-only', async () => {
    const userId = await seedUser('66040411', 'PROFESSIONAL');
    const profileId = await seedProfile(userId);
    await seedReputation(profileId);
    const token = await login('66040411', 'rep-r11');
    const before = await db.query(
      `SELECT verification_level, recomputed_at, updated_at FROM pros.reputation WHERE professional_id = $1`,
      [profileId],
    );
    expect((await get(token).expect(200)).body.verification_level).toBe(2);
    await get(token).expect(200);
    const after = await db.query(
      `SELECT verification_level, recomputed_at, updated_at FROM pros.reputation WHERE professional_id = $1`,
      [profileId],
    );
    expect(after).toEqual(before);
  });
});
