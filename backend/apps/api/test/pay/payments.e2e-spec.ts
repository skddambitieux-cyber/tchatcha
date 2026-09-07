/**
 * TCHATCHA — E2E Lot FCT-013 (paiement & escrow). 8 catégories de sécurité du
 * bug.md : tiers, signature webhook, webhook inconnu/malformé, montant imposé,
 * replay webhook, replay Idempotency-Key, concurrence de confirmations,
 * atomicité SUCCEEDED + request PAID. OTP PAYMENT seedé directement dans le
 * store chaud (cooldown 45 s contourné).
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createHmac, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
import { OtpStorePortToken } from '../../src/modules/auth/application/ports/otp-store.port';
import { OtpPurpose } from '../../src/modules/auth/domain/entities/otp-code.entity';
import { hashOtpCode } from '../../src/modules/auth/application/services/otp.service';
import { SIMULATOR_WEBHOOK_SECRET } from '../../src/modules/pay/infrastructure/gateways/simulator-payment.gateway';

const CLIENT = '6699070011';
const TIERS = '6699070012';
const PRO = '6699070013';
const CODE = '123456';
const sign = (body: unknown) =>
  `sha256=${createHmac('sha256', SIMULATOR_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex')}`;
const signRaw = (raw: string) =>
  `sha256=${createHmac('sha256', SIMULATOR_WEBHOOK_SECRET)
    .update(raw)
    .digest('hex')}`;
const webhook = (app: Awaited<ReturnType<typeof createTestApp>>, provider: string, body: unknown) =>
  app.http
    .post(`/api/v1/payments/webhook/${provider}`)
    .set('X-Tchatcha-Signature', sign(body))
    .send(body);

describe('Lot FCT-013 payments', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>,
    db: DataSource,
    clientId: string,
    tiersId: string,
    bookingId: string,
    requestId: string,
    paymentId: string,
    token: string,
    tiersToken: string;
  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    await clean();
    clientId = randomUUID();
    tiersId = randomUUID();
    const proUser = randomUUID();
    const proId = randomUUID();
    await db.query(
      `INSERT INTO users.users(id,country_code,phone,password_hash,full_name,status,created_at,updated_at)VALUES($1,'BJ',$2,'','Client','ACTIVE',now(),now()),($3,'BJ',$4,'','Tiers','ACTIVE',now(),now()),($5,'BJ',$6,'','Pro','ACTIVE',now(),now())`,
      [clientId, CLIENT, tiersId, TIERS, proUser, PRO],
    );
    await db.query(
      `INSERT INTO users.user_roles(user_id,role,granted_at)VALUES($1,'CLIENT',now()),($2,'CLIENT',now()),($3,'PROFESSIONAL',now())`,
      [clientId, tiersId, proUser],
    );
    await db.query(
      `INSERT INTO pros.profiles(id,user_id,business_name,status,verified,currency,country_code,created_at,updated_at)VALUES($1,$2,'Pro pay','ACTIVE',false,'XOF','BJ',now(),now())`,
      [proId, proUser],
    );
    const cat = (await db.query(`SELECT id FROM pros.categories WHERE slug='plombiers' LIMIT 1`))[0].id;
    const div = (await db.query(`SELECT id FROM geo.divisions WHERE name='Cotonou' LIMIT 1`))[0].id;
    const seeded = await seed(cat, div, proId, 2);
    bookingId = seeded.bookingId;
    requestId = seeded.requestId;
    token = await login(CLIENT);
    tiersToken = await login(TIERS);
    // OTP PAYMENT : seed direct dans le store chaud (cooldown 45 s contourné).
    const otpStore = app.app.get(OtpStorePortToken);
    await otpStore.saveOtp({
      phone: CLIENT,
      purpose: OtpPurpose.PAYMENT,
      codeHash: hashOtpCode(CODE),
      expiresAt: new Date(Date.now() + 300_000),
      attempts: 0,
      usedAt: null,
    });
  });
  afterAll(async () => {
    await clean();
    await app?.close();
  });
  async function seed(cat: string, div: string, proId: string, offsetDays: number) {
    const rid = randomUUID(),
      qid = randomUUID(),
      bid = randomUUID(),
      sid = randomUUID();
    await db.query(
      `INSERT INTO market.service_requests(id,client_id,category_id,title,description,country_code,division_id,currency,urgency,status,expires_at,version,created_at,updated_at)VALUES($1,$2,$3,'Mission','D','BJ',$4,'XOF','NORMAL','SELECTED',now()+interval '2 day',4,now(),now())`,
      [rid, clientId, cat, div],
    );
    await db.query(
      `INSERT INTO market.quotes(id,request_id,professional_id,created_by,price,currency,status,accepted_at,version,created_at,updated_at)VALUES($1,$2,$3,(SELECT user_id FROM pros.profiles WHERE id=$3),12000,'XOF','ACCEPTED',now(),2,now(),now())`,
      [qid, rid, proId],
    );
    await db.query(
      `INSERT INTO pros.availability_slots(id,professional_id,start_at,end_at)VALUES($1,$2,now()+($3||' days')::interval,now()+($3||' days')::interval+interval '2 hour')`,
      [sid, proId, `${offsetDays}`],
    );
    await db.query(
      `INSERT INTO market.bookings(id,request_id,quote_id,client_id,professional_id,slot_id,scheduled_start,scheduled_end,status,price,currency,version,created_at,updated_at)VALUES($1,$2,$3,$4,$5,$6,now()+($7||' days')::interval,now()+($7||' days')::interval+interval '2 hour','CONFIRMED',12000,'XOF',1,now(),now())`,
      [bid, rid, qid, clientId, proId, sid, `${offsetDays}`],
    );
    return { bookingId: bid, requestId: rid };
  }
  async function seedAuthorized(opRef: string, booking: string, request: string) {
    const txn = randomUUID();
    await db.query(
      `INSERT INTO pay.transactions(id,user_id,type,status,amount,fee,currency,booking_id,country_code,version,created_at,updated_at)VALUES($1,$2,'SERVICE_PAYMENT','AUTHORIZED',12000,0,'XOF',$3,'BJ',2,now(),now())`,
      [txn, clientId, booking],
    );
    await db.query(
      `INSERT INTO pay.provider_operations(transaction_id,provider_code,operation_type,status,amount,external_ref,initiated_at)VALUES($1,'SIMULATOR','CHARGE','PENDING',12000,$2,now())`,
      [txn, opRef],
    );
    return txn;
  }
  async function login(phone: string) {
    await app.http
      .post('/api/v1/auth/otp/request')
      .send({ country_code: 'BJ', phone, purpose: 'LOGIN' })
      .expect(202);
    const r = await app.http
      .post('/api/v1/auth/login')
      .send({ country_code: 'BJ', phone, code: app.sms.lastCode('BJ', phone), device: { session_id: 'pay' } })
      .expect(200);
    return r.body.access_token;
  }
  async function clean() {
    if (!db) return;
    await db.query(
      `DELETE FROM pay.webhook_events WHERE provider_code='SIMULATOR'`,
    );
    await db.query(
      `DELETE FROM pay.provider_operations WHERE transaction_id IN(SELECT id FROM pay.transactions WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1))`,
      [`669907%`],
    );
    await db.query(
      `DELETE FROM pay.transactions WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`669907%`],
    );
    await db.query(
      `DELETE FROM market.bookings WHERE client_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`669907%`],
    );
    await db.query(`DELETE FROM market.quotes WHERE request_id IN(SELECT id FROM market.service_requests WHERE client_id IN(SELECT id FROM users.users WHERE phone LIKE $1))`, [`669907%`]);
    await db.query(
      `DELETE FROM market.service_requests WHERE client_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`669907%`],
    );
    await db.query(
      `DELETE FROM pros.availability_slots WHERE professional_id IN(SELECT id FROM pros.profiles WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1))`,
      [`669907%`],
    );
    await db.query(
      `DELETE FROM pros.profiles WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`669907%`],
    );
    await db.query(
      `DELETE FROM authz.refresh_tokens WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`669907%`],
    );
    await db.query(`DELETE FROM authz.otp_codes WHERE phone LIKE $1`, [`669907%`]);
    await db.query(
      `DELETE FROM users.user_roles WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [`669907%`],
    );
    await db.query(`DELETE FROM users.users WHERE phone LIKE $1`, [`669907%`]);
  }
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const initiate = (key: string, booking: string, extra: Record<string, unknown> = {}) =>
    app.http
      .post('/api/v1/payments/initiate')
      .set(auth())
      .set('Idempotency-Key', key)
      .send({ booking_id: booking, ...extra });

  it('initiate : montant serveur (jamais client), PENDING, puis replay même clé', async () => {
    const key = randomUUID();
    const p = await initiate(key, bookingId).expect(201);
    paymentId = p.body.id;
    expect(p.body).toMatchObject({
      type: 'SERVICE_PAYMENT',
      status: 'PENDING',
      amount: 12000,
      currency: 'XOF',
      booking_id: bookingId,
    });
    // Replay : même clé + même body → 201 avec la réponse d'origine.
    const replay = await initiate(key, bookingId).expect(201);
    expect(replay.body.id).toBe(paymentId);
  });
  it('montant imposé par le client → 400 ; clé réutilisée avec body différent → 409', async () => {
    await initiate(randomUUID(), bookingId, { amount: 1 }).expect(400);
    await initiate(randomUUID(), bookingId, { currency: 'USD' }).expect(400);
    const key = randomUUID();
    await initiate(key, bookingId).expect(201);
    const c2 = randomUUID();
    const rid = randomUUID();
    await db.query(
      `INSERT INTO market.service_requests(id,client_id,category_id,title,description,country_code,division_id,currency,urgency,status,expires_at,version,created_at,updated_at)VALUES($1,$2,(SELECT id FROM pros.categories WHERE slug='plombiers' LIMIT 1),'Autre','D','BJ',(SELECT id FROM geo.divisions WHERE name='Cotonou' LIMIT 1),'XOF','NORMAL','SELECTED',now()+interval '2 day',4,now(),now())`,
      [rid, clientId],
    );
    const qid = randomUUID();
    await db.query(
      `INSERT INTO market.quotes(id,request_id,professional_id,created_by,price,currency,status,accepted_at,version,created_at,updated_at)VALUES($1,$2,(SELECT p.id FROM pros.profiles p JOIN users.users u ON u.id=p.user_id WHERE u.phone=$3 LIMIT 1),(SELECT user_id FROM pros.profiles p JOIN users.users u ON u.id=p.user_id WHERE u.phone=$3 LIMIT 1),5000,'XOF','ACCEPTED',now(),2,now(),now())`,
      [qid, rid, PRO],
    );
    const sid = randomUUID();
    await db.query(
      `INSERT INTO pros.availability_slots(id,professional_id,start_at,end_at)VALUES($1,(SELECT p.id FROM pros.profiles p JOIN users.users u ON u.id=p.user_id WHERE u.phone=$2 LIMIT 1),now()+interval '8 day',now()+interval '8 day 2 hour')`,
      [sid, PRO],
    );
    await db.query(
      `INSERT INTO market.bookings(id,request_id,quote_id,client_id,professional_id,slot_id,scheduled_start,scheduled_end,status,price,currency,version,created_at,updated_at)VALUES($1,$2,$3,$4,(SELECT p.id FROM pros.profiles p JOIN users.users u ON u.id=p.user_id WHERE u.phone=$5 LIMIT 1),$6,now()+interval '8 day',now()+interval '8 day 2 hour','CONFIRMED',5000,'XOF',1,now(),now())`,
      [c2, rid, qid, clientId, PRO, sid],
    );
    await initiate(key, c2).expect(409);
  });
  it('tiers : ne peut ni initier, ni lire, ni vérifier un paiement d’autrui', async () => {
    await app.http
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${tiersToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ booking_id: bookingId })
      .expect(404);
    await app.http
      .get(`/api/v1/payments/${paymentId}`)
      .set('Authorization', `Bearer ${tiersToken}`)
      .expect(404);
    await app.http
      .post(`/api/v1/payments/${paymentId}/verify`)
      .set('Authorization', `Bearer ${tiersToken}`)
      .send({ code: CODE })
      .expect(404);
  });
  it('verify : mauvais OTP → 401 ; bon OTP → SUCCEEDED + request PAID + booking IN_PROGRESS (atomique)', async () => {
    await app.http
      .post(`/api/v1/payments/${paymentId}/verify`)
      .set(auth())
      .send({ code: '000000' })
      .expect(401);
    const v = await app.http
      .post(`/api/v1/payments/${paymentId}/verify`)
      .set(auth())
      .send({ code: CODE })
      .expect(200);
    expect(v.body.status).toBe('SUCCEEDED');
    const [txn] = await db.query(
      `SELECT status FROM pay.transactions WHERE id=$1`,
      [paymentId],
    );
    const [op] = await db.query(
      `SELECT status FROM pay.provider_operations WHERE transaction_id=$1`,
      [paymentId],
    );
    const [req] = await db.query(
      `SELECT status FROM market.service_requests WHERE id=$1`,
      [requestId],
    );
    const [booking] = await db.query(
      `SELECT status FROM market.bookings WHERE id=$1`,
      [bookingId],
    );
    expect(txn.status).toBe('SUCCEEDED');
    expect(op.status).toBe('SUCCEEDED');
    expect(req.status).toBe('PAID');
    expect(booking.status).toBe('IN_PROGRESS');
    // Re-verify idempotent.
    const again = await app.http
      .post(`/api/v1/payments/${paymentId}/verify`)
      .set(auth())
      .send({ code: CODE })
      .expect(200);
    expect(again.body.status).toBe('SUCCEEDED');
  });
  it('nouvelle tentative après succès → 409 (un seul SUCCEEDED par booking)', async () => {
    await initiate(randomUUID(), bookingId).expect(409);
  });
  it('webhook : confirmation fournisseur seule → SUCCEEDED + request PAID, replay dédupliqué', async () => {
    const cat = (await db.query(`SELECT id FROM pros.categories WHERE slug='plombiers' LIMIT 1`))[0].id;
    const div = (await db.query(`SELECT id FROM geo.divisions WHERE name='Cotonou' LIMIT 1`))[0].id;
    const proId = (await db.query(`SELECT p.id FROM pros.profiles p JOIN users.users u ON u.id=p.user_id WHERE u.phone=$1 LIMIT 1`, [PRO]))[0].id;
    const seeded2 = await seed(cat, div, proId, 4);
    const txnId = await seedAuthorized('SIM-E2E-A', seeded2.bookingId, seeded2.requestId);
    const body = {
      event_id: randomUUID(),
      event_type: 'payment.succeeded',
      external_ref: 'SIM-E2E-A',
    };
    const before = await db.query(`SELECT status FROM market.service_requests WHERE id=$1`, [seeded2.requestId]);
    expect(before[0].status).toBe('SELECTED');
    await webhook(app, 'SIMULATOR', body).expect(200);
    const [req] = await db.query(`SELECT status FROM market.service_requests WHERE id=$1`, [seeded2.requestId]);
    const [txn] = await db.query(`SELECT status FROM pay.transactions WHERE id=$1`, [txnId]);
    expect(req.status).toBe('PAID');
    expect(txn.status).toBe('SUCCEEDED');
    // Replay : déduplication uq_webhook_events → 200, pas de double traitement.
    await webhook(app, 'SIMULATOR', body).expect(200);
    const [n] = await db.query(`SELECT count(*)::int n FROM pay.webhook_events WHERE external_ref='SIM-E2E-A'`);
    expect(n.n).toBe(1);
  });
  it('webhook : signature absente/invalide → 401 ; JSON malformé → 400 ; événement inconnu → 422 ; réf inconnue → 400', async () => {
    await app.http
      .post('/api/v1/payments/webhook/SIMULATOR')
      .send({ event_id: randomUUID(), event_type: 'payment.succeeded', external_ref: 'SIM-E2E-B' })
      .expect(401);
    await app.http
      .post('/api/v1/payments/webhook/SIMULATOR')
      .set('X-Tchatcha-Signature', 'sha256=deadbeef')
      .send({ event_id: randomUUID(), event_type: 'payment.succeeded', external_ref: 'SIM-E2E-B' })
      .expect(401);
    await app.http
      .post('/api/v1/payments/webhook/SIMULATOR')
      .set('X-Tchatcha-Signature', signRaw('{pas du json'))
      .send('{pas du json')
      .expect(400);
    await webhook(app, 'SIMULATOR', {
      event_id: randomUUID(),
      event_type: 'payment.refunded',
      external_ref: 'SIM-E2E-C',
    }).expect(422);
    await webhook(app, 'SIMULATOR', {
      event_id: randomUUID(),
      event_type: 'payment.succeeded',
      external_ref: 'SIM-INCONNU',
    }).expect(400);
  });
  it('webhook : deux confirmations concurrentes du même paiement → une seule gagne', async () => {
    const cat = (await db.query(`SELECT id FROM pros.categories WHERE slug='plombiers' LIMIT 1`))[0].id;
    const div = (await db.query(`SELECT id FROM geo.divisions WHERE name='Cotonou' LIMIT 1`))[0].id;
    const proId = (await db.query(`SELECT p.id FROM pros.profiles p JOIN users.users u ON u.id=p.user_id WHERE u.phone=$1 LIMIT 1`, [PRO]))[0].id;
    const seeded3 = await seed(cat, div, proId, 6);
    const txnId = await seedAuthorized('SIM-E2E-D1', seeded3.bookingId, seeded3.requestId);
    await db.query(
      `INSERT INTO pay.provider_operations(transaction_id,provider_code,operation_type,status,amount,external_ref,initiated_at)VALUES($1,'SIMULATOR','CHARGE','PENDING',12000,'SIM-E2E-D2',now())`,
      [txnId],
    );
    const [a, b] = await Promise.all([
      webhook(app, 'SIMULATOR', { event_id: randomUUID(), event_type: 'payment.succeeded', external_ref: 'SIM-E2E-D1' }),
      webhook(app, 'SIMULATOR', { event_id: randomUUID(), event_type: 'payment.succeeded', external_ref: 'SIM-E2E-D2' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const [s] = await db.query(`SELECT count(*)::int n FROM pay.transactions WHERE id=$1 AND status='SUCCEEDED'`, [txnId]);
    expect(s.n).toBe(1);
    const [req] = await db.query(`SELECT status FROM market.service_requests WHERE id=$1`, [seeded3.requestId]);
    expect(req.status).toBe('PAID');
  });
});
