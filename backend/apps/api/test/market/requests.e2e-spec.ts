import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
import { User, UserStatus } from '../../src/modules/auth/domain/entities/user.entity';

const PREFIX = '669904';

describe('Lot 3A — demandes client', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;
  let clientToken: string;
  let otherToken: string;
  let proToken: string;
  let categoryId: string;
  let rootCategoryId: string;
  let divisionId: string;
  let requestId: string;

  beforeAll(async () => {
    app = await createTestApp(); db = app.app.get(DataSource); await cleanup();
    const cats = await db.query(`SELECT leaf.id leaf_id, root.id root_id
      FROM pros.categories leaf JOIN pros.categories root ON root.id=leaf.parent_id
      WHERE leaf.slug='plombiers' AND leaf.country_code='BJ' LIMIT 1`);
    categoryId = cats[0].leaf_id; rootCategoryId = cats[0].root_id;
    divisionId = (await db.query(`SELECT id FROM geo.divisions WHERE name='Cotonou' AND type='COMMUNE' LIMIT 1`))[0].id;
    clientToken = await seedAndLogin(`${PREFIX}00001`, 'CLIENT');
    otherToken = await seedAndLogin(`${PREFIX}00002`, 'CLIENT');
    proToken = await seedAndLogin(`${PREFIX}00003`, 'PROFESSIONAL');
  });
  afterAll(async () => { await cleanup(); await app?.close(); });

  async function cleanup() {
    await db.query(`DELETE FROM market.service_requests WHERE client_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM authz.refresh_tokens WHERE user_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM authz.otp_codes WHERE phone LIKE $1`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM users.users WHERE phone LIKE $1`, [`${PREFIX}%`]);
  }
  async function seedAndLogin(phone: string, role: string) {
    const user = await db.getRepository(User).save(db.getRepository(User).create({
      country_code: 'BJ', phone, password_hash: '', full_name: phone,
      email: null, status: UserStatus.ACTIVE, flags: {},
    }));
    await db.query(`INSERT INTO users.user_roles(user_id,role,granted_at) VALUES($1,$2,now())`, [user.id, role]);
    if (role === 'PROFESSIONAL') await db.query(`INSERT INTO pros.profiles
      (user_id,status,verified,currency,country_code) VALUES($1,'ACTIVE',false,'XOF','BJ')`, [user.id]);
    await app.http.post('/api/v1/auth/otp/request').send({ country_code: 'BJ', phone, purpose: 'LOGIN' }).expect(202);
    const code = app.sms.lastCode('BJ', phone);
    const login = await app.http.post('/api/v1/auth/login').send({ country_code: 'BJ', phone, code,
      device: { session_id: `market-${phone}` } }).expect(200);
    return login.body.access_token as string;
  }
  const body = () => ({ category_id: categoryId, title: 'Réparer une fuite',
    description: 'Fuite importante dans la cuisine', budget_min: 5000,
    budget_max: 15000, urgency: 'HIGH', location: { division_id: divisionId, lat: 6.37, lon: 2.42 } });
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('publie et rejoue une demande de façon idempotente', async () => {
    const key = randomUUID();
    const first = await app.http.post('/api/v1/requests').set(auth(clientToken)).set('Idempotency-Key', key).send(body()).expect(201);
    requestId = first.body.id;
    expect(first.body).toMatchObject({ country_code: 'BJ', currency: 'XOF', status: 'OPEN', version: 1,
      division_id: divisionId, category_id: categoryId });
    const replay = await app.http.post('/api/v1/requests').set(auth(clientToken)).set('Idempotency-Key', key).send(body()).expect(201);
    expect(replay.body.id).toBe(requestId);
    await app.http.post('/api/v1/requests').set(auth(clientToken)).set('Idempotency-Key', key)
      .send({ ...body(), title: 'Autre contenu' }).expect(409);
  });

  it('verrouille rôle, catégorie, géographie, budget et localisation', async () => {
    await app.http.post('/api/v1/requests').set(auth(proToken)).set('Idempotency-Key', randomUUID()).send(body()).expect(403);
    await app.http.post('/api/v1/requests').set(auth(clientToken)).set('Idempotency-Key', randomUUID())
      .send({ ...body(), category_id: rootCategoryId }).expect(422);
    await app.http.post('/api/v1/requests').set(auth(clientToken)).set('Idempotency-Key', randomUUID())
      .send({ ...body(), budget_min: 20000 }).expect(422);
    await app.http.post('/api/v1/requests').set(auth(clientToken)).set('Idempotency-Key', randomUUID())
      .send({ ...body(), location: {} }).expect(422);
  });

  it('liste et détaille uniquement les demandes du propriétaire avec keyset', async () => {
    const list = await app.http.get('/api/v1/requests?limit=1').set(auth(clientToken)).expect(200);
    expect(list.body.items[0].id).toBe(requestId);
    await app.http.get(`/api/v1/requests/${requestId}`).set(auth(clientToken)).expect(200);
    await app.http.get(`/api/v1/requests/${requestId}`).set(auth(otherToken)).expect(404);
  });

  it('annule OPEN avec version optimiste et interdit une répétition', async () => {
    const cancelled = await app.http.post(`/api/v1/requests/${requestId}/cancel`).set(auth(clientToken))
      .send({ reason: 'Projet reporté', version: 1 }).expect(201);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancel_reason: 'Projet reporté', version: 2 });
    await app.http.post(`/api/v1/requests/${requestId}/cancel`).set(auth(clientToken))
      .send({ reason: 'Encore', version: 2 }).expect(409);
  });

  it('matérialise atomiquement une demande expirée avant lecture/mutation', async () => {
    const key = randomUUID();
    const created = await app.http.post('/api/v1/requests').set(auth(clientToken)).set('Idempotency-Key', key).send(body()).expect(201);
    await db.query(`UPDATE market.service_requests SET expires_at=now()-interval '1 minute' WHERE id=$1`, [created.body.id]);
    const detail = await app.http.get(`/api/v1/requests/${created.body.id}`).set(auth(clientToken)).expect(200);
    expect(detail.body).toMatchObject({ status: 'EXPIRED', version: 2 });
    await app.http.post(`/api/v1/requests/${created.body.id}/cancel`).set(auth(clientToken))
      .send({ reason: 'Trop tard', version: 2 }).expect(409);
  });
});
