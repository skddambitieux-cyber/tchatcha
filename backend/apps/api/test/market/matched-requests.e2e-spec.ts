import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
import { SearchProjectionPortToken } from '../../src/modules/search/application/ports/search-projection.port';
import type { SearchProjectionPort } from '../../src/modules/search/application/ports/search-projection.port';

const PREFIX = '669905';

describe('Lot 3B — demandes compatibles professionnel', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;
  let projection: SearchProjectionPort;
  let proToken: string;
  let clientToken: string;
  let clientId: string;
  let proId: string;
  let categoryId: string;
  let otherCategoryId: string;
  let cotonouId: string;
  let calaviId: string;
  let nearbyId: string;
  let communeId: string;
  let outsideId: string;
  let expiredId: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    projection = app.app.get(SearchProjectionPortToken);
    await cleanup();
    const categories = await db.query(`SELECT id, slug FROM pros.categories
      WHERE country_code='BJ' AND slug IN ('plombiers','electriciens')`);
    categoryId = categories.find((row: { slug: string }) => row.slug === 'plombiers').id;
    otherCategoryId = categories.find((row: { slug: string }) => row.slug === 'electriciens').id;
    const divisions = await db.query(`SELECT id,name FROM geo.divisions
      WHERE type='COMMUNE' AND name IN ('Cotonou','Abomey-Calavi')`);
    cotonouId = divisions.find((row: { name: string }) => row.name === 'Cotonou').id;
    calaviId = divisions.find((row: { name: string }) => row.name === 'Abomey-Calavi').id;
    ({ id: clientId, token: clientToken } = await seedUser(`${PREFIX}00001`, 'CLIENT'));
    const professional = await seedUser(`${PREFIX}00002`, 'PROFESSIONAL');
    proToken = professional.token;
    proId = randomUUID();
    await db.query(`INSERT INTO pros.profiles
      (id,user_id,business_name,status,verified,currency,country_code,created_at,updated_at)
      VALUES($1,$2,'Pro matching','ACTIVE',false,'XOF','BJ',now(),now())`, [proId, professional.id]);
    await db.query(`INSERT INTO pros.services
      (id,professional_id,category_id,title,is_primary,created_at,updated_at)
      VALUES($1,$2,$3,'Plomberie',true,now(),now())`, [randomUUID(), proId, categoryId]);
    await db.query(`INSERT INTO pros.locations
      (professional_id,country_code,division_id,location,service_radius_km,address_text,updated_at)
      VALUES($1,'BJ',$2,ST_SetSRID(ST_MakePoint(2.42,6.37),4326),10,'Privé',now())`, [proId, cotonouId]);
    await projection.rebuild(proId);
    nearbyId = await seedRequest(categoryId, cotonouId, 2.43, 6.37);
    communeId = await seedRequest(categoryId, cotonouId, null, null);
    outsideId = await seedRequest(categoryId, calaviId, 2.35, 6.45);
    await seedRequest(otherCategoryId, cotonouId, 2.43, 6.37);
    expiredId = await seedRequest(categoryId, cotonouId, 2.43, 6.37, true);
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
      code: app.sms.lastCode('BJ', phone), device: { session_id: `matched-${phone}` } }).expect(200);
    return { id, token: login.body.access_token as string };
  }

  async function seedRequest(category: string, division: string, lon: number | null, lat: number | null, expired = false) {
    const id = randomUUID();
    await db.query(`INSERT INTO market.service_requests
      (id,client_id,category_id,title,description,country_code,division_id,location,
       budget_min,budget_max,currency,urgency,status,expires_at,version,created_at,updated_at)
      VALUES($1,$2,$3,'Besoin plomberie','Description publique','BJ',$4,
       CASE WHEN $5::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($5,$6),4326) END,
       5000,15000,'XOF','HIGH','OPEN',
       CASE WHEN $7 THEN now()-interval '1 minute' ELSE now()+interval '48 hours' END,
       1,now()-($8::int*interval '1 minute'),now())`,
      [id, clientId, category, division, lon, lat, expired, expired ? 5 : Math.floor(Math.random() * 4)]);
    return id;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('liste seulement les demandes compatibles par rayon ou même commune', async () => {
    const response = await app.http.get('/api/v1/requests/matched?limit=10').set(auth(proToken)).expect(200);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toEqual(expect.arrayContaining([nearbyId, communeId]));
    expect(ids).not.toContain(outsideId);
    expect(ids).not.toContain(expiredId);
    const nearby = response.body.items.find((item: { id: string }) => item.id === nearbyId);
    expect(nearby.distance_km).toEqual(expect.any(Number));
    const commune = response.body.items.find((item: { id: string }) => item.id === communeId);
    expect(commune.distance_km).toBeNull();
  });

  it('ne divulgue aucune donnée privée dans la liste ou le détail', async () => {
    const detail = await app.http.get(`/api/v1/requests/matched/${nearbyId}`).set(auth(proToken)).expect(200);
    expect(detail.body).toMatchObject({ id: nearbyId, commune: { id: cotonouId }, category: { id: categoryId } });
    for (const forbidden of ['client_id', 'full_name', 'phone', 'email', 'lat', 'lon', 'location', 'address', 'canceled_by']) {
      expect(JSON.stringify(detail.body)).not.toContain(`"${forbidden}"`);
    }
  });

  it('retourne le même 404 pour une demande hors matching ou inconnue', async () => {
    await app.http.get(`/api/v1/requests/matched/${outsideId}`).set(auth(proToken)).expect(404);
    await app.http.get(`/api/v1/requests/matched/${randomUUID()}`).set(auth(proToken)).expect(404);
  });

  it('refuse un client et matérialise les expirations avant lecture', async () => {
    await app.http.get('/api/v1/requests/matched').set(auth(clientToken)).expect(403);
    const expired = await db.query(`SELECT status,version FROM market.service_requests WHERE id=$1`, [expiredId]);
    expect(expired[0]).toMatchObject({ status: 'EXPIRED', version: 2 });
  });
});
