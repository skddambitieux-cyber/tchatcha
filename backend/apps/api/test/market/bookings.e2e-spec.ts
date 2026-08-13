import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
const P = '6699070000';
describe('Lot 3H bookings', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>,
    db: DataSource,
    token: string,
    clientId: string,
    proId: string,
    q1: string,
    q2: string,
    s1: string,
    s2: string;
  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    await clean();
    clientId = randomUUID();
    const proUser = randomUUID();
    proId = randomUUID();
    await db.query(
      `INSERT INTO users.users(id,country_code,phone,password_hash,full_name,status,created_at,updated_at)VALUES($1,'BJ',$2,'','Client','ACTIVE',now(),now()),($3,'BJ',$4,'','Pro','ACTIVE',now(),now())`,
      [clientId, `${P}1`, proUser, `${P}2`],
    );
    await db.query(
      `INSERT INTO users.user_roles(user_id,role,granted_at)VALUES($1,'CLIENT',now()),($2,'PROFESSIONAL',now())`,
      [clientId, proUser],
    );
    await db.query(
      `INSERT INTO pros.profiles(id,user_id,business_name,status,verified,currency,country_code,created_at,updated_at)VALUES($1,$2,'Pro slots','ACTIVE',false,'XOF','BJ',now(),now())`,
      [proId, proUser],
    );
    const cat = (
      await db.query(
        `SELECT id FROM pros.categories WHERE slug='plombiers' LIMIT 1`,
      )
    )[0].id;
    const div = (
      await db.query(
        `SELECT id FROM geo.divisions WHERE name='Cotonou' LIMIT 1`,
      )
    )[0].id;
    q1 = await seed(cat, div);
    q2 = await seed(cat, div);
    s1 = randomUUID();
    s2 = randomUUID();
    await db.query(
      `INSERT INTO pros.availability_slots(id,professional_id,start_at,end_at)VALUES($1,$3,now()+interval '2 day',now()+interval '2 day 2 hour'),($2,$3,now()+interval '2 day 1 hour',now()+interval '2 day 3 hour')`,
      [s1, s2, proId],
    );
    await app.http
      .post('/api/v1/auth/otp/request')
      .send({ country_code: 'BJ', phone: `${P}1`, purpose: 'LOGIN' })
      .expect(202);
    const r = await app.http
      .post('/api/v1/auth/login')
      .send({
        country_code: 'BJ',
        phone: `${P}1`,
        code: app.sms.lastCode('BJ', `${P}1`),
        device: { session_id: 'book' },
      })
      .expect(200);
    token = r.body.access_token;
  });
  afterAll(async () => {
    await clean();
    await app?.close();
  });
  async function seed(cat: string, div: string) {
    const rid = randomUUID(),
      qid = randomUUID();
    await db.query(
      `INSERT INTO market.service_requests(id,client_id,category_id,title,description,country_code,division_id,currency,urgency,status,expires_at,version,created_at,updated_at)VALUES($1,$2,$3,'Mission','D','BJ',$4,'XOF','NORMAL','SELECTED',now()+interval '2 day',4,now(),now())`,
      [rid, clientId, cat, div],
    );
    await db.query(
      `INSERT INTO market.quotes(id,request_id,professional_id,created_by,price,currency,status,accepted_at,version,created_at,updated_at)VALUES($1,$2,$3,(SELECT user_id FROM pros.profiles WHERE id=$3),12000,'XOF','ACCEPTED',now(),2,now(),now())`,
      [qid, rid, proId],
    );
    return qid;
  }
  async function clean() {
    if (!db) return;
    await db.query(
      `DELETE FROM market.bookings WHERE client_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`${P}%`],
    );
    await db.query(
      `DELETE FROM market.service_requests WHERE client_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`${P}%`],
    );
    await db.query(
      `DELETE FROM pros.availability_slots WHERE professional_id IN(SELECT id FROM pros.profiles WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1))`,
      [`${P}%`],
    );
    await db.query(
      `DELETE FROM pros.profiles WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`${P}%`],
    );
    await db.query(
      `DELETE FROM authz.refresh_tokens WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`${P}%`],
    );
    await db.query(`DELETE FROM authz.otp_codes WHERE phone LIKE $1`, [
      `${P}%`,
    ]);
    await db.query(
      `DELETE FROM users.user_roles WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`${P}%`],
    );
    await db.query(`DELETE FROM users.users WHERE phone LIKE $1`, [`${P}%`]);
  }
  const auth = () => ({ Authorization: `Bearer ${token}` });
  it('liste puis réserve avec snapshot serveur et replay', async () => {
    const slots = await app.http
      .get(
        `/api/v1/professionals/${proId}/slots?from=${new Date(Date.now() + 86400000).toISOString()}&to=${new Date(Date.now() + 4 * 86400000).toISOString()}`,
      )
      .expect(200);
    expect(slots.body.items).toHaveLength(2);
    const key = randomUUID(),
      body = {
        quote_id: q1,
        slot_id: s1,
        slot_version: 1,
        quote_version: 2,
        request_version: 4,
      };
    const b = await app.http
      .post('/api/v1/bookings')
      .set(auth())
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(b.body).toMatchObject({
      price: 12000,
      currency: 'XOF',
      status: 'CONFIRMED',
    });
    const replay = await app.http
      .post('/api/v1/bookings')
      .set(auth())
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(replay.body.id).toBe(b.body.id);
  });
  it('garantit SQL anti-chevauchement sous deux requêtes concurrentes', async () => {
    await db.query(`DELETE FROM market.bookings`);
    const [a, b] = await Promise.all([
      app.http
        .post('/api/v1/bookings')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({
          quote_id: q1,
          slot_id: s1,
          slot_version: 1,
          quote_version: 2,
          request_version: 4,
        }),
      app.http
        .post('/api/v1/bookings')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({
          quote_id: q2,
          slot_id: s2,
          slot_version: 1,
          quote_version: 2,
          request_version: 4,
        }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(
      (await db.query(`SELECT count(*)::int n FROM market.bookings`))[0].n,
    ).toBe(1);
  });
});
