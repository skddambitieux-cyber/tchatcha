import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
import { SearchProjectionPortToken } from '../../src/modules/search/application/ports/search-projection.port';
import type { SearchProjectionPort } from '../../src/modules/search/application/ports/search-projection.port';

const PREFIX = '669906';

describe('Lot 3C — création initiale de devis', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;
  let projection: SearchProjectionPort;
  let proToken: string;
  let clientToken: string;
  let clientId: string;
  let proId: string;
  let categoryId: string;
  let divisionId: string;
  let matchedRequestId: string;
  let unmatchedRequestId: string;
  let quoteId: string;

  beforeAll(async () => {
    app = await createTestApp(); db = app.app.get(DataSource);
    projection = app.app.get(SearchProjectionPortToken); await cleanup();
    categoryId = (await db.query(`SELECT id FROM pros.categories
      WHERE slug='plombiers' AND country_code='BJ' LIMIT 1`))[0].id;
    divisionId = (await db.query(`SELECT id FROM geo.divisions
      WHERE name='Cotonou' AND type='COMMUNE' LIMIT 1`))[0].id;
    ({ id: clientId, token: clientToken } = await seedUser(`${PREFIX}00001`, 'CLIENT'));
    const professional = await seedUser(`${PREFIX}00002`, 'PROFESSIONAL');
    proToken = professional.token; proId = randomUUID();
    await db.query(`INSERT INTO pros.profiles
      (id,user_id,business_name,status,verified,currency,country_code,created_at,updated_at)
      VALUES($1,$2,'Pro devis','ACTIVE',false,'XOF','BJ',now(),now())`, [proId, professional.id]);
    await db.query(`INSERT INTO pros.services
      (id,professional_id,category_id,title,is_primary,created_at,updated_at)
      VALUES($1,$2,$3,'Plomberie',true,now(),now())`, [randomUUID(), proId, categoryId]);
    await db.query(`INSERT INTO pros.locations
      (professional_id,country_code,division_id,location,service_radius_km,address_text,updated_at)
      VALUES($1,'BJ',$2,ST_SetSRID(ST_MakePoint(2.42,6.37),4326),10,'Privé',now())`, [proId, divisionId]);
    await projection.rebuild(proId);
    matchedRequestId = await seedRequest(2.43, 6.37);
    unmatchedRequestId = await seedRequest(2.35, 6.45);
  });

  afterAll(async () => { await cleanup(); await app?.close(); });

  async function cleanup() {
    await db.query(`DELETE FROM market.service_requests WHERE client_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM search.pro_search_docs WHERE professional_id IN
      (SELECT id FROM pros.profiles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1))`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM pros.locations WHERE professional_id IN
      (SELECT id FROM pros.profiles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1))`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM pros.services WHERE professional_id IN
      (SELECT id FROM pros.profiles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1))`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM authz.refresh_tokens WHERE user_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM authz.otp_codes WHERE phone LIKE $1`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN
      (SELECT id FROM users.users WHERE phone LIKE $1)`, [`${PREFIX}%`]);
    await db.query(`DELETE FROM users.users WHERE phone LIKE $1`, [`${PREFIX}%`]);
  }

  async function seedUser(phone: string, role: string) {
    const id = randomUUID();
    await db.query(`INSERT INTO users.users
      (id,country_code,phone,password_hash,full_name,status,created_at,updated_at)
      VALUES($1,'BJ',$2,'',$2,'ACTIVE',now(),now())`, [id, phone]);
    await db.query(`INSERT INTO users.user_roles(user_id,role,granted_at) VALUES($1,$2,now())`, [id, role]);
    await app.http.post('/api/v1/auth/otp/request').send({ country_code: 'BJ', phone, purpose: 'LOGIN' }).expect(202);
    const login = await app.http.post('/api/v1/auth/login').send({ country_code: 'BJ', phone,
      code: app.sms.lastCode('BJ', phone), device: { session_id: `quotes-${phone}` } }).expect(200);
    return { id, token: login.body.access_token as string };
  }

  async function seedRequest(lon: number, lat: number) {
    const id = randomUUID();
    await db.query(`INSERT INTO market.service_requests
      (id,client_id,category_id,title,description,country_code,division_id,location,
       budget_min,budget_max,currency,urgency,status,expires_at,version,created_at,updated_at)
      VALUES($1,$2,$3,'Réparation','Besoin détaillé','BJ',$4,
       ST_SetSRID(ST_MakePoint($5,$6),4326),5000,10000,'XOF','NORMAL','OPEN',
       now()+interval '48 hours',1,now(),now())`, [id, clientId, categoryId, divisionId, lon, lat]);
    return id;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const quoteBody = { price: 12000, duration_days: 2, message: 'Intervention rapide' };

  it('crée et rejoue un devis, avec devise serveur et transition QUOTED', async () => {
    const key = randomUUID();
    const first = await app.http.post(`/api/v1/requests/${matchedRequestId}/quotes`)
      .set(auth(proToken)).set('Idempotency-Key', key).send(quoteBody).expect(201);
    expect(first.body).toMatchObject({ request_id: matchedRequestId, professional_id: proId,
      price: 12000, currency: 'XOF', duration_days: 2, status: 'PENDING', version: 1 });
    quoteId = first.body.id;
    const replay = await app.http.post(`/api/v1/requests/${matchedRequestId}/quotes`)
      .set(auth(proToken)).set('Idempotency-Key', key).send(quoteBody).expect(201);
    expect(replay.body.id).toBe(first.body.id);
    const request = await db.query(`SELECT status,version FROM market.service_requests WHERE id=$1`, [matchedRequestId]);
    expect(request[0]).toMatchObject({ status: 'QUOTED', version: 2 });
  });

  it('liste côté client avec badge hors budget et pagination keyset', async () => {
    const page = await app.http.get(`/api/v1/requests/${matchedRequestId}/quotes?limit=1`)
      .set(auth(clientToken)).expect(200);
    expect(page.body.items[0]).toMatchObject({ id: quoteId, out_of_budget: true,
      professional: { id: proId, business_name: 'Pro devis' },
      request: { id: matchedRequestId, title: 'Réparation' } });
    expect(page.body.next_cursor).toBeNull();
    await app.http.get(`/api/v1/requests/${matchedRequestId}/quotes`).set(auth(proToken)).expect(403);
  });

  it('liste les devis envoyés et limite le détail aux participants', async () => {
    const sent = await app.http.get('/api/v1/quotes/sent').set(auth(proToken)).expect(200);
    expect(sent.body.items[0]).toMatchObject({ id: quoteId, request: { id: matchedRequestId } });
    await app.http.get(`/api/v1/quotes/${quoteId}`).set(auth(proToken)).expect(200);
    await app.http.get(`/api/v1/quotes/${quoteId}`).set(auth(clientToken)).expect(200);
    const stranger = await seedUser(`${PREFIX}00003`, 'CLIENT');
    await app.http.get(`/api/v1/quotes/${quoteId}`).set(auth(stranger.token)).expect(404);
  });

  it('rejette réutilisation différente et second devis actif', async () => {
    const prior = (await db.query(`SELECT professional_idempotency_key FROM market.quotes
      WHERE request_id=$1 AND professional_id=$2`, [matchedRequestId, proId]))[0];
    await app.http.post(`/api/v1/requests/${matchedRequestId}/quotes`).set(auth(proToken))
      .set('Idempotency-Key', prior.professional_idempotency_key).send({ ...quoteBody, price: 13000 }).expect(409);
    await app.http.post(`/api/v1/requests/${matchedRequestId}/quotes`).set(auth(proToken))
      .set('Idempotency-Key', randomUUID()).send(quoteBody).expect(409);
  });

  it('masque une demande hors matching et refuse un client', async () => {
    await app.http.post(`/api/v1/requests/${unmatchedRequestId}/quotes`).set(auth(proToken))
      .set('Idempotency-Key', randomUUID()).send(quoteBody).expect(404);
    await app.http.post(`/api/v1/requests/${unmatchedRequestId}/quotes`).set(auth(clientToken))
      .set('Idempotency-Key', randomUUID()).send(quoteBody).expect(403);
  });

  it('valide prix, délai, message et clé idempotente', async () => {
    await app.http.post(`/api/v1/requests/${unmatchedRequestId}/quotes`).set(auth(proToken))
      .send(quoteBody).expect(422);
    await app.http.post(`/api/v1/requests/${unmatchedRequestId}/quotes`).set(auth(proToken))
      .set('Idempotency-Key', randomUUID()).send({ price: 0, duration_days: 0, message: '' }).expect(400);
  });

  it('retire son devis avec version optimiste et interdit les répétitions ou tiers', async () => {
    const other = await seedUser(`${PREFIX}00004`, 'PROFESSIONAL');
    await db.query(`INSERT INTO pros.profiles
      (id,user_id,business_name,status,verified,currency,country_code,created_at,updated_at)
      VALUES($1,$2,'Autre pro','ACTIVE',false,'XOF','BJ',now(),now())`, [randomUUID(), other.id]);
    await app.http.post(`/api/v1/quotes/${quoteId}/withdraw`).set(auth(other.token))
      .send({ version: 1 }).expect(404);
    await app.http.post(`/api/v1/quotes/${quoteId}/withdraw`).set(auth(proToken))
      .send({ version: 99 }).expect(409);
    const withdrawn = await app.http.post(`/api/v1/quotes/${quoteId}/withdraw`).set(auth(proToken))
      .send({ version: 1 }).expect(201);
    expect(withdrawn.body).toMatchObject({ id: quoteId, status: 'WITHDRAWN', version: 2 });
    await app.http.post(`/api/v1/quotes/${quoteId}/withdraw`).set(auth(proToken))
      .send({ version: 2 }).expect(409);
  });
});
