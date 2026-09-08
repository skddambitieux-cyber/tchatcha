import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';

const PREFIX = '669916%';
const CLIENT = '66991601';
const PRO = '66991602';
const OUTSIDER = '66991603';
const ADMIN = '66991604';

describe('FCT-016A reviews', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;
  let clientId: string;
  let proUserId: string;
  let proId: string;
  let clientToken: string;
  let proToken: string;
  let outsiderToken: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    await clean();
    clientId = randomUUID();
    proUserId = randomUUID();
    proId = randomUUID();
    const outsiderId = randomUUID();
    const adminId = randomUUID();
    await db.query(`INSERT INTO users.users(id,country_code,phone,password_hash,full_name,status,created_at,updated_at)
      VALUES($1,'BJ',$2,'','Review client','ACTIVE',now(),now()),($3,'BJ',$4,'','Review pro','ACTIVE',now(),now()),
      ($5,'BJ',$6,'','Review outsider','ACTIVE',now(),now()),($7,'BJ',$8,'','Review admin','ACTIVE',now(),now())`,
      [clientId, CLIENT, proUserId, PRO, outsiderId, OUTSIDER, adminId, ADMIN]);
    await db.query(`INSERT INTO users.user_roles(user_id,role,granted_at) VALUES
      ($1,'CLIENT',now()),($2,'PROFESSIONAL',now()),($3,'CLIENT',now()),($4,'ADMIN',now())`,
      [clientId, proUserId, outsiderId, adminId]);
    await db.query(`INSERT INTO pros.profiles(id,user_id,business_name,status,verified,currency,country_code,created_at,updated_at)
      VALUES($1,$2,'Review pro','ACTIVE',false,'XOF','BJ',now(),now())`, [proId, proUserId]);
    clientToken = await login(CLIENT);
    proToken = await login(PRO);
    outsiderToken = await login(OUTSIDER);
    adminToken = await login(ADMIN);
  });

  beforeEach(async () => { await resetReviews(); });
  afterAll(async () => { await clean(); await app?.close(); });

  it('crée valablement, rejoue la même clé et n’expose pas les identifiants privés', async () => {
    const bookingId = await seedBooking('COMPLETED', 10);
    const body = { booking_id: bookingId, rating: 5, punctuality: 4, quality: 5, price_ratio: 4, politeness: 5, comment: 'Très bien', media_ids: [] };
    const key = randomUUID();
    const first = await create(body, key, clientToken).expect(201);
    const replay = await create(body, key, clientToken).expect(201);
    expect(replay.body).toEqual(first.body);
    expect(first.body.is_late).toBe(false);
    expect(first.body).not.toHaveProperty('client_id');
    expect(first.body).not.toHaveProperty('professional_id');
    expect(first.body).not.toHaveProperty('request_id');
    const count = (await db.query(`SELECT count(*)::int AS n FROM review.reviews WHERE booking_id=$1`, [bookingId]))[0].n;
    expect(Number(count)).toBe(1);
  });

  it('refuse le professionnel, l’admin et le non-participant', async () => {
    const bookingId = await seedBooking('COMPLETED', 10);
    const body = validBody(bookingId);
    await create(body, randomUUID(), proToken).expect(403);
    await create(body, randomUUID(), adminToken).expect(403);
    await create(body, randomUUID(), outsiderToken).expect(403);
  });

  it('gère booking inconnu et les états interdits, mais accepte COMPLETED', async () => {
    await create(validBody(randomUUID()), randomUUID(), clientToken).expect(404);
    for (const status of ['IN_PROGRESS', 'DISPUTED', 'CANCELLED', 'REFUNDED']) {
      await create(validBody(await seedBooking(status, 10)), randomUUID(), clientToken).expect(409);
    }
    await create(validBody(await seedBooking('COMPLETED', 10)), randomUUID(), clientToken).expect(201);
  });

  it('valide chaque note et la longueur du commentaire', async () => {
    const fields = ['rating', 'punctuality', 'quality', 'price_ratio', 'politeness'] as const;
    for (const field of fields) {
      for (const value of [undefined, 0, 6]) {
        const body = validBody(await seedBooking('COMPLETED', 10));
        if (value === undefined) delete body[field]; else body[field] = value;
        await create(body, randomUUID(), clientToken).expect(400);
      }
    }
    const tooLong = { ...validBody(await seedBooking('COMPLETED', 10)), comment: 'x'.repeat(1001) };
    await create(tooLong, randomUUID(), clientToken).expect(400);
    const tooManyMedia = { ...validBody(await seedBooking('COMPLETED', 10)), media_ids: Array.from({ length: 6 }, () => randomUUID()) };
    await create(tooManyMedia, randomUUID(), clientToken).expect(400);
  });

  it('valide les médias selon l’infrastructure actuelle', async () => {
    const bookingId = await seedBooking('COMPLETED', 10);
    await create({ ...validBody(bookingId), media_ids: [randomUUID()] }, randomUUID(), clientToken).expect(404);
    const mediaId = randomUUID();
    await db.query(`INSERT INTO media.files(id,owner_type,owner_id,purpose,media_type,mime_type,size_bytes,url,s3_key,status,created_at,updated_at)
      VALUES($1,'USER',$2,'REVIEW_PHOTO','IMAGE','image/jpeg',100,'https://cdn.test/review.jpg','test/review.jpg','READY',now(),now())`, [mediaId, clientId]);
    const response = await create({ ...validBody(await seedBooking('COMPLETED', 10)), media_ids: [mediaId] }, randomUUID(), clientToken).expect(201);
    expect(response.body.media_ids).toEqual([mediaId]);
  });

  it('gère mismatch, nouvelle clé et deux créations concurrentes', async () => {
    const bookingId = await seedBooking('COMPLETED', 10);
    const key = randomUUID();
    const first = validBody(bookingId);
    await create(first, key, clientToken).expect(201);
    await create({ ...first, comment: 'différent' }, key, clientToken).expect(409);
    await create(first, randomUUID(), clientToken).expect(409);

    const concurrentBooking = await seedBooking('COMPLETED', 10);
    const results = await Promise.all([
      create(validBody(concurrentBooking), randomUUID(), clientToken),
      create(validBody(concurrentBooking), randomUUID(), clientToken),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('marque précisément les avis normaux et tardifs depuis la fin métier', async () => {
    const normal = await create(validBody(await seedBooking('COMPLETED', 10)), randomUUID(), clientToken).expect(201);
    const late = await create(validBody(await seedBooking('COMPLETED', 31)), randomUUID(), clientToken).expect(201);
    expect(normal.body.is_late).toBe(false);
    expect(late.body.is_late).toBe(true);
    const row = (await db.query(`SELECT updated_at,client_confirmed_at,pro_confirmed_at FROM market.bookings WHERE id=$1`, [late.body.booking_id]))[0];
    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date(row.client_confirmed_at).getTime());
    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date(row.pro_confirmed_at).getTime());
    expect(late.body.is_late).toBe(true);
  });

  it('pagine la fiche publique, calcule les cinq moyennes et garde zéro cohérent', async () => {
    const emptyProfessional = randomUUID();
    const emptyUser = randomUUID();
    await db.query(`INSERT INTO users.users(id,country_code,phone,password_hash,full_name,status,created_at,updated_at) VALUES($1,'BJ','66991605','', 'Empty','ACTIVE',now(),now())`, [emptyUser]);
    await db.query(`INSERT INTO pros.profiles(id,user_id,business_name,status,verified,currency,country_code,created_at,updated_at) VALUES($1,$2,'Empty','ACTIVE',false,'XOF','BJ',now(),now())`, [emptyProfessional, emptyUser]);
    const empty = await app.http.get(`/api/v1/professionals/${emptyProfessional}/reviews`).expect(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.averages).toMatchObject({ count: 0, rating: null, punctuality: null, quality: null, price_ratio: null, politeness: null });
    for (const scores of [[5,4,3,2,1], [3,2,5,4,3], [4,5,4,5,5]]) {
      const id = await seedBooking('COMPLETED', 10);
      await create({ booking_id: id, rating: scores[0], punctuality: scores[1], quality: scores[2], price_ratio: scores[3], politeness: scores[4] }, randomUUID(), clientToken).expect(201);
    }
    const first = await app.http.get(`/api/v1/professionals/${proId}/reviews?limit=2`).expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.pagination.has_more).toBe(true);
    const second = await app.http.get(`/api/v1/professionals/${proId}/reviews?limit=2&cursor=${encodeURIComponent(first.body.pagination.next_cursor)}`).expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(first.body.averages).toMatchObject({ rating: 4, punctuality: 3.7, quality: 4, price_ratio: 3.7, politeness: 3 });
    await app.http.get(`/api/v1/professionals/${randomUUID()}/reviews`).expect(404);
  });

  it('modifie un avis une seule fois, audite le diff et recalcule les moyennes', async () => {
    const bookingId = await seedBooking('COMPLETED', 10);
    const created = await create(validBody(bookingId), randomUUID(), clientToken).expect(201);
    const updated = await app.http.patch(`/api/v1/reviews/${created.body.id}`).set('Authorization', `Bearer ${clientToken}`)
      .send({ rating: 1, punctuality: 2, quality: 3, price_ratio: 4, politeness: 5, comment: 'Corrigé', media_ids: [] }).expect(200);
    expect(updated.body).toMatchObject({ id: created.body.id, rating: 1, punctuality: 2, comment: 'Corrigé' });
    await app.http.patch(`/api/v1/reviews/${created.body.id}`).set('Authorization', `Bearer ${clientToken}`)
      .send({ rating: 5, punctuality: 5, quality: 5, price_ratio: 5, politeness: 5 }).expect(409);
    const row = (await db.query(`SELECT edit_count FROM review.reviews WHERE id=$1`, [created.body.id]))[0];
    const audit = (await db.query(`SELECT before,after FROM audit.logs WHERE entity_type='REVIEW' AND entity_id=$1 AND action='review.edited'`, [created.body.id]))[0];
    expect(Number(row.edit_count)).toBe(1);
    expect(audit.before.rating).toBe(5);
    expect(audit.after.rating).toBe(1);
    const list = await app.http.get(`/api/v1/professionals/${proId}/reviews`).expect(200);
    expect(list.body.averages).toMatchObject({ count: 1, rating: 1, punctuality: 2, quality: 3, price_ratio: 4, politeness: 5 });
  });

  it('refuse modification hors délai et par tout autre rôle', async () => {
    const created = await create(validBody(await seedBooking('COMPLETED', 10)), randomUUID(), clientToken).expect(201);
    await db.query(`UPDATE review.reviews SET created_at=now()-interval '49 hours' WHERE id=$1`, [created.body.id]);
    await app.http.patch(`/api/v1/reviews/${created.body.id}`).set('Authorization', `Bearer ${clientToken}`).send({ rating: 4, punctuality: 4, quality: 4, price_ratio: 4, politeness: 4 }).expect(409);
    await db.query(`UPDATE review.reviews SET created_at=now() WHERE id=$1`, [created.body.id]);
    for (const token of [proToken, outsiderToken, adminToken]) {
      await app.http.patch(`/api/v1/reviews/${created.body.id}`).set('Authorization', `Bearer ${token}`).send({ rating: 4, punctuality: 4, quality: 4, price_ratio: 4, politeness: 4 }).expect(403);
    }
  });

  it('protège deux modifications concurrentes', async () => {
    const created = await create(validBody(await seedBooking('COMPLETED', 10)), randomUUID(), clientToken).expect(201);
    const body = { rating: 4, punctuality: 4, quality: 4, price_ratio: 4, politeness: 4 };
    const results = await Promise.all([
      app.http.patch(`/api/v1/reviews/${created.body.id}`).set('Authorization', `Bearer ${clientToken}`).send(body),
      app.http.patch(`/api/v1/reviews/${created.body.id}`).set('Authorization', `Bearer ${clientToken}`).send({ ...body, comment: 'course' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('répond une fois, rejoue la clé et publie sans données privées', async () => {
    const created = await create(validBody(await seedBooking('COMPLETED', 10)), randomUUID(), clientToken).expect(201);
    const body = { body: 'Merci pour votre retour.' };
    const key = randomUUID();
    const first = await app.http.post(`/api/v1/reviews/${created.body.id}/respond`).set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', key).send(body).expect(201);
    const replay = await app.http.post(`/api/v1/reviews/${created.body.id}/respond`).set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', key).send(body).expect(201);
    expect(replay.body).toEqual(first.body);
    await app.http.post(`/api/v1/reviews/${created.body.id}/respond`).set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', randomUUID()).send(body).expect(409);
    await app.http.post(`/api/v1/reviews/${created.body.id}/respond`).set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', key).send({ body: 'Autre' }).expect(409);
    const listed = await app.http.get(`/api/v1/professionals/${proId}/reviews`).expect(200);
    expect(listed.body.data[0].response).toMatchObject({ body: body.body });
    expect(listed.body.data[0].response).not.toHaveProperty('professional_id');
  });

  it('refuse réponse non autorisée/invalide et deux réponses concurrentes', async () => {
    const created = await create(validBody(await seedBooking('COMPLETED', 10)), randomUUID(), clientToken).expect(201);
    for (const token of [clientToken, outsiderToken, adminToken]) {
      await app.http.post(`/api/v1/reviews/${created.body.id}/respond`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send({ body: 'Non' }).expect(403);
    }
    await app.http.post(`/api/v1/reviews/${created.body.id}/respond`).set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', randomUUID()).send({ body: '' }).expect(400);
    await app.http.post(`/api/v1/reviews/${created.body.id}/respond`).set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', randomUUID()).send({ body: 'x'.repeat(501) }).expect(400);
    const results = await Promise.all([
      app.http.post(`/api/v1/reviews/${created.body.id}/respond`).set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', randomUUID()).send({ body: 'A' }),
      app.http.post(`/api/v1/reviews/${created.body.id}/respond`).set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', randomUUID()).send({ body: 'B' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  function validBody(booking_id: string) { return { booking_id, rating: 5, punctuality: 5, quality: 5, price_ratio: 5, politeness: 5 }; }
  function create(body: Record<string, unknown>, key: string, token: string) { return app.http.post('/api/v1/reviews').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body); }

  async function seedBooking(status: string, ageDays: number) {
    const requestId = randomUUID(); const quoteId = randomUUID(); const slotId = randomUUID(); const bookingId = randomUUID();
    const category = (await db.query(`SELECT id FROM pros.categories WHERE slug='plombiers' LIMIT 1`))[0].id;
    const division = (await db.query(`SELECT id FROM geo.divisions WHERE name='Cotonou' LIMIT 1`))[0].id;
    await db.query(`INSERT INTO market.service_requests(id,client_id,category_id,title,description,country_code,division_id,currency,urgency,status,expires_at,version,created_at,updated_at) VALUES($1,$2,$3,'Review','Description','BJ',$4,'XOF','NORMAL','SELECTED',now()+interval '1 day',1,now(),now())`, [requestId, clientId, category, division]);
    await db.query(`INSERT INTO market.quotes(id,request_id,professional_id,created_by,price,currency,status,accepted_at,version,created_at,updated_at) VALUES($1,$2,$3,$4,10000,'XOF','ACCEPTED',now(),1,now(),now())`, [quoteId, requestId, proId, proUserId]);
    await db.query(`INSERT INTO pros.availability_slots(id,professional_id,start_at,end_at,active,version) VALUES($1,$2,now()+interval '1 day',now()+interval '1 day 2 hour',true,1)`, [slotId, proId]);
    await db.query(`INSERT INTO market.bookings(id,request_id,quote_id,client_id,professional_id,slot_id,scheduled_start,scheduled_end,status,client_confirmed_at,pro_confirmed_at,price,currency,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()-interval '40 day 2 hour',now()-interval '40 day',$7,now()-($8||' days')::interval,now()-($8||' days')::interval,10000,'XOF',2,now(),now())`, [bookingId, requestId, quoteId, clientId, proId, slotId, status, ageDays]);
    return bookingId;
  }
  async function login(phone: string) {
    await app.http.post('/api/v1/auth/otp/request').send({ country_code: 'BJ', phone, purpose: 'LOGIN' }).expect(202);
    const response = await app.http.post('/api/v1/auth/login').send({ country_code: 'BJ', phone, code: app.sms.lastCode('BJ', phone), device: { session_id: `fct016-${phone}` } }).expect(200);
    return response.body.access_token as string;
  }
  async function resetReviews() {
    await db.query(`DELETE FROM media.files WHERE owner_type='REVIEW' AND owner_id IN (SELECT id FROM review.reviews WHERE reviewer_id=$1)`, [clientId]);
    await db.query(`DELETE FROM review.reviews WHERE reviewer_id=$1`, [clientId]);
    await db.query(`DELETE FROM review.professional_review_stats WHERE professional_id=$1`, [proId]);
  }
  async function clean() {
    if (!db) return;
    await db.query(`DELETE FROM audit.logs WHERE actor_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM media.files WHERE owner_type='REVIEW' AND owner_id IN (SELECT id FROM review.reviews WHERE reviewer_id IN (SELECT id FROM users.users WHERE phone LIKE $1))`, [PREFIX]);
    await db.query(`DELETE FROM review.reviews WHERE reviewer_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM review.professional_review_stats WHERE professional_id IN (SELECT id FROM pros.profiles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1))`, [PREFIX]);
    await db.query(`DELETE FROM media.files WHERE owner_type='USER' AND owner_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM market.bookings WHERE client_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM market.quotes WHERE created_by IN (SELECT id FROM users.users WHERE phone LIKE $1) OR professional_id IN (SELECT id FROM pros.profiles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1))`, [PREFIX]);
    await db.query(`DELETE FROM market.service_requests WHERE client_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM pros.availability_slots WHERE professional_id IN (SELECT id FROM pros.profiles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1))`, [PREFIX]);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM users.users WHERE phone LIKE $1`, [PREFIX]);
  }
});
