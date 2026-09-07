import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
import { BookingRepositoryPortToken } from '../../src/modules/market/application/ports/booking-repository.port';
import type { BookingRepositoryPort } from '../../src/modules/market/application/ports/booking-repository.port';

const PREFIX = '669915%';
const CLIENT = '66991501';
const PRO = '66991502';
const OUTSIDER = '66991503';
const ADMIN = '66991504';

describe('FCT-015 disputes', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;
  let clientToken: string;
  let proToken: string;
  let outsiderToken: string;
  let adminToken: string;
  let clientId: string;
  let proUserId: string;
  let bookingId: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    await clean();
    clientId = randomUUID();
    proUserId = randomUUID();
    const proId = randomUUID();
    const outsiderId = randomUUID();
    const adminId = randomUUID();
    await db.query(`INSERT INTO users.users(id,country_code,phone,password_hash,full_name,status,created_at,updated_at)
      VALUES($1,'BJ',$2,'','Client','ACTIVE',now(),now()),($3,'BJ',$4,'','Pro','ACTIVE',now(),now()),($5,'BJ',$6,'','Outsider','ACTIVE',now(),now()),($7,'BJ',$8,'','Admin','ACTIVE',now(),now())`, [clientId, CLIENT, proUserId, PRO, outsiderId, OUTSIDER, adminId, ADMIN]);
    await db.query(`INSERT INTO users.user_roles(user_id,role,granted_at) VALUES($1,'CLIENT',now()),($2,'PROFESSIONAL',now()),($3,'CLIENT',now()),($4,'ADMIN',now())`, [clientId, proUserId, outsiderId, adminId]);
    await db.query(`INSERT INTO pros.profiles(id,user_id,business_name,status,verified,currency,country_code,created_at,updated_at)
      VALUES($1,$2,'FCT-015 Pro','ACTIVE',false,'XOF','BJ',now(),now())`, [proId, proUserId]);
    const category = (await db.query(`SELECT id FROM pros.categories WHERE slug='plombiers' LIMIT 1`))[0].id;
    const division = (await db.query(`SELECT id FROM geo.divisions WHERE name='Cotonou' LIMIT 1`))[0].id;
    const requestId = randomUUID();
    const quoteId = randomUUID();
    const slotId = randomUUID();
    bookingId = randomUUID();
    const transactionId = randomUUID();
    await db.query(`INSERT INTO market.service_requests(id,client_id,category_id,title,description,country_code,division_id,currency,urgency,status,expires_at,version,created_at,updated_at)
      VALUES($1,$2,$3,'Litige','D','BJ',$4,'XOF','NORMAL','SELECTED',now()+interval '2 day',1,now(),now())`, [requestId, clientId, category, division]);
    await db.query(`INSERT INTO market.quotes(id,request_id,professional_id,created_by,price,currency,status,accepted_at,version,created_at,updated_at)
      VALUES($1,$2,(SELECT id FROM pros.profiles WHERE user_id=$3),$3,12000,'XOF','ACCEPTED',now(),1,now(),now())`, [quoteId, requestId, proUserId]);
    await db.query(`INSERT INTO pros.availability_slots(id,professional_id,start_at,end_at,active,version)
      VALUES($1,(SELECT id FROM pros.profiles WHERE user_id=$2),now()+interval '2 day',now()+interval '2 day 2 hour',true,1)`, [slotId, proUserId]);
    await db.query(`INSERT INTO market.bookings(id,request_id,quote_id,client_id,professional_id,slot_id,scheduled_start,scheduled_end,status,price,currency,version,created_at,updated_at)
      VALUES($1,$2,$3,$4,(SELECT id FROM pros.profiles WHERE user_id=$5),$6,now()+interval '2 day',now()+interval '2 day 2 hour','IN_PROGRESS',12000,'XOF',1,now(),now())`, [bookingId, requestId, quoteId, clientId, proUserId, slotId]);
    await db.query(`INSERT INTO pay.transactions(id,user_id,type,status,amount,fee,currency,booking_id,country_code,version,created_at,updated_at)
      VALUES($1,$2,'SERVICE_PAYMENT','SUCCEEDED',12000,0,'XOF',$3,'BJ',1,now(),now())`, [transactionId, clientId, bookingId]);
    clientToken = await login(CLIENT);
    proToken = await login(PRO);
    outsiderToken = await login(OUTSIDER);
    adminToken = await login(ADMIN);
  });

  afterAll(async () => { await clean(); await app?.close(); });

  it('ouvre, rejoue par idempotence et lit un litige', async () => {
    const key = randomUUID();
    const body = { booking_id: bookingId, reason: 'OTHER', description: 'Travail à vérifier', media_ids: [] };
    const first = await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', key).send(body).expect(201);
    expect(first.body.status).toBe('OPEN');
    const replay = await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', key).send(body).expect(201);
    expect(replay.body).toEqual(first.body);
    await app.http.get(`/api/v1/disputes/${first.body.id}`).set('Authorization', `Bearer ${proToken}`).expect(200);
    expect((await db.query(`SELECT status FROM market.bookings WHERE id=$1`, [bookingId]))[0].status).toBe('DISPUTED');
  });

  it('ouvre par le client puis par le professionnel concerné', async () => {
    await resetBooking();
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ booking_id: bookingId, reason: 'OTHER', description: 'Client', media_ids: [] }).expect(201);
    await resetBooking();
    const response = await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', randomUUID()).send({ booking_id: bookingId, reason: 'WORK_INCOMPLETE', description: 'Professionnel', media_ids: [] }).expect(201);
    expect(response.body.opened_by).toBe(proUserId);
  });

  it('autorise lecture client/pro/admin et refuse le non-participant', async () => {
    await resetBooking();
    const opened = await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ booking_id: bookingId, reason: 'OTHER', description: 'Lecture', media_ids: [] }).expect(201);
    await app.http.get(`/api/v1/disputes/${opened.body.id}`).set('Authorization', `Bearer ${clientToken}`).expect(200);
    await app.http.get(`/api/v1/disputes/${opened.body.id}`).set('Authorization', `Bearer ${proToken}`).expect(200);
    await app.http.get(`/api/v1/disputes/${opened.body.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    await app.http.get(`/api/v1/disputes/${opened.body.id}`).set('Authorization', `Bearer ${outsiderToken}`).expect(404);
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${adminToken}`).set('Idempotency-Key', randomUUID()).send({ booking_id: bookingId, reason: 'OTHER', description: 'Admin', media_ids: [] }).expect(403);
  });

  it('refuse booking inconnu, état interdit, description trop longue et plus de cinq médias', async () => {
    await resetBooking();
    const base = { reason: 'OTHER', description: 'x', media_ids: [] };
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ ...base, booking_id: randomUUID() }).expect(404);
    await db.query(`UPDATE market.bookings SET status='COMPLETED' WHERE id=$1`, [bookingId]);
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ ...base, booking_id: bookingId }).expect(409);
    await resetBooking();
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ ...base, booking_id: bookingId, description: 'x'.repeat(1501) }).expect(400);
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ ...base, booking_id: bookingId, media_ids: Array.from({ length: 6 }, () => randomUUID()) }).expect(400);
  });

  it('refuse une nouvelle ouverture et un mismatch de clé', async () => {
    await resetBooking();
    const key = randomUUID();
    const first = { booking_id: bookingId, reason: 'OTHER', description: 'Autre', media_ids: [] };
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', key).send(first).expect(201);
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', key).send({ ...first, description: 'Différent' }).expect(409);
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ booking_id: bookingId, reason: 'OTHER', description: 'Autre', media_ids: [] }).expect(409);
  });

  it('sérialise deux ouvertures concurrentes : une seule gagne', async () => {
    await resetBooking();
    const body = { booking_id: bookingId, reason: 'WORK_INCOMPLETE', description: 'Course concurrente', media_ids: [] };
    const [client, pro] = await Promise.all([
      app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send(body),
      app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${proToken}`).set('Idempotency-Key', randomUUID()).send(body),
    ]);
    expect([client.status, pro.status].sort()).toEqual([201, 409]);
    expect(Number((await db.query(`SELECT count(*)::int AS n FROM market.disputes WHERE booking_id=$1 AND status='OPEN'`, [bookingId]))[0].n)).toBe(1);
  });

  it('refuse la course payout si une réservation PENDING existe', async () => {
    await resetBooking();
    const row = (await db.query(`SELECT id FROM pay.transactions WHERE booking_id=$1`, [bookingId]))[0];
    await db.query(`UPDATE market.bookings SET status='IN_PROGRESS' WHERE id=$1`, [bookingId]);
    await db.query(`DELETE FROM market.disputes WHERE booking_id=$1`, [bookingId]);
    await db.query(`INSERT INTO pay.provider_operations(transaction_id,provider_code,operation_type,status,amount,request_payload,initiated_at)
      VALUES($1,'SIMULATOR','PAYOUT','PENDING',10800,'{}',now())`, [row.id]);
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ booking_id: bookingId, reason: 'PAYMENT_ISSUE', description: 'Payout en cours', media_ids: [] }).expect(409);
  });

  it('litige gagnant : DISPUTED avant payout, aucun payout envoyé', async () => {
    await resetBooking();
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ booking_id: bookingId, reason: 'OTHER', description: 'Litige prioritaire', media_ids: [] }).expect(201);
    await app.http.post('/api/v1/bookings/' + bookingId + '/confirm').set('Authorization', `Bearer ${clientToken}`).expect(409);
    expect(Number((await db.query(`SELECT count(*)::int AS n FROM pay.provider_operations o JOIN pay.transactions t ON t.id=o.transaction_id WHERE t.booking_id=$1 AND o.operation_type='PAYOUT'`, [bookingId]))[0].n)).toBe(0);
  });

  it('payout gagnant : PENDING commit avant provider, litige en conflit', async () => {
    await resetBooking();
    const repository = app.app.get<BookingRepositoryPort>(BookingRepositoryPortToken);
    await repository.confirm(bookingId, clientId);
    const progress = await repository.confirm(bookingId, proUserId);
    expect(['SECOND_CONFIRMED', 'RESUME_RELEASE']).toContain(progress.kind);
    expect(Number((await db.query(`SELECT count(*)::int AS n FROM pay.provider_operations o JOIN pay.transactions t ON t.id=o.transaction_id WHERE t.booking_id=$1 AND o.operation_type='PAYOUT' AND o.status='PENDING'`, [bookingId]))[0].n)).toBe(1);
    await app.http.post('/api/v1/disputes').set('Authorization', `Bearer ${clientToken}`).set('Idempotency-Key', randomUUID()).send({ booking_id: bookingId, reason: 'PAYMENT_ISSUE', description: 'Payout réservé', media_ids: [] }).expect(409);
  });

  async function login(phone: string) {
    await app.http.post('/api/v1/auth/otp/request').send({ country_code: 'BJ', phone, purpose: 'LOGIN' }).expect(202);
    const response = await app.http.post('/api/v1/auth/login').send({ country_code: 'BJ', phone, code: app.sms.lastCode('BJ', phone), device: { session_id: `fct015-${phone}` } }).expect(200);
    return response.body.access_token as string;
  }
  async function clean() {
    if (!db) return;
    await db.query(`DELETE FROM market.disputes WHERE booking_id IN (SELECT id FROM market.bookings WHERE client_id IN (SELECT id FROM users.users WHERE phone LIKE $1))`, [PREFIX]);
    await db.query(`DELETE FROM pay.provider_operations WHERE transaction_id IN (SELECT id FROM pay.transactions WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1))`, [PREFIX]);
    await db.query(`DELETE FROM pay.transactions WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM market.bookings WHERE client_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM market.quotes WHERE created_by IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM market.service_requests WHERE client_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM pros.availability_slots WHERE professional_id IN (SELECT p.id FROM pros.profiles p JOIN users.users u ON u.id=p.user_id WHERE u.phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE $1)`, [PREFIX]);
    await db.query(`DELETE FROM users.users WHERE phone LIKE $1`, [PREFIX]);
  }
  async function resetBooking() {
    await db.query(`DELETE FROM market.disputes WHERE booking_id=$1`, [bookingId]);
    await db.query(`DELETE FROM pay.provider_operations WHERE transaction_id IN (SELECT id FROM pay.transactions WHERE booking_id=$1)`, [bookingId]);
    await db.query(`UPDATE market.bookings SET status='IN_PROGRESS',client_confirmed_at=NULL,pro_confirmed_at=NULL WHERE id=$1`, [bookingId]);
  }
});
