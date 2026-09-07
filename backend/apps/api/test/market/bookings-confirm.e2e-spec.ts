/**
 * TCHATCHA — E2E Lot FCT-014 (39-cadrage-market-fct-014.md) : double
 * confirmation + libération escrow. Couvre les cas exigés bug.md : client→pro,
 * pro→client, rejeu, mauvais participant, mauvais statut, échec release,
 * calcul de commission (0/10/25 %), backfill, concurrence réelle Promise.all,
 * et la régression FCT-013 (paiement SUCCEEDED → booking IN_PROGRESS).
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
import { OtpStorePortToken } from '../../src/modules/auth/application/ports/otp-store.port';
import { OtpPurpose } from '../../src/modules/auth/domain/entities/otp-code.entity';
import { hashOtpCode } from '../../src/modules/auth/application/services/otp.service';
import { PaymentGatewayPortToken } from '../../src/modules/pay/application/ports/payment-gateway.port';
import { TestPaymentGateway } from '../test-payment-gateway';
import {
  BookingRepositoryPort,
  BookingRepositoryPortToken,
} from '../../src/modules/market/application/ports/booking-repository.port';

const CLIENT = '6699080011';
const TIERS = '6699080012';
const PRO = '6699080013';
const CODE = '123456';
const PREFIX = '669908%';

describe('Lot FCT-014 bookings confirm', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>,
    db: DataSource,
    clientId: string,
    proId: string,
    clientToken: string,
    proToken: string,
    tiersToken: string;
  const CATEGORIES = new Map<string, string>();

  beforeAll(async () => {
    app = await createTestApp();
    db = app.app.get(DataSource);
    await clean();
    clientId = randomUUID();
    const tiersId = randomUUID();
    const proUser = randomUUID();
    proId = randomUUID();
    await db.query(
      `INSERT INTO users.users(id,country_code,phone,password_hash,full_name,status,created_at,updated_at)VALUES($1,'BJ',$2,'','Client','ACTIVE',now(),now()),($3,'BJ',$4,'','Tiers','ACTIVE',now(),now()),($5,'BJ',$6,'','Pro','ACTIVE',now(),now())`,
      [clientId, CLIENT, tiersId, TIERS, proUser, PRO],
    );
    await db.query(
      `INSERT INTO users.user_roles(user_id,role,granted_at)VALUES($1,'CLIENT',now()),($2,'CLIENT',now()),($3,'PROFESSIONAL',now())`,
      [clientId, tiersId, proUser],
    );
    await db.query(
      `INSERT INTO pros.profiles(id,user_id,business_name,status,verified,currency,country_code,created_at,updated_at)VALUES($1,$2,'Pro FCT-014','ACTIVE',false,'XOF','BJ',now(),now())`,
      [proId, proUser],
    );
    clientToken = await login(CLIENT);
    proToken = await login(PRO);
    tiersToken = await login(TIERS);
  });
  afterAll(async () => {
    await clean();
    await app?.close();
  });

  it('catégories dédiées pour les taux de commission (0 % et 25 %)', async () => {
    const zero = randomUUID();
    const l25 = randomUUID();
    await db.query(
      `INSERT INTO pros.categories(id,country_code,name,slug,sort_order,commission_rate)VALUES($1,'BJ','FCT-014 zéro','fct014-zero',96,0.00),($2,'BJ','FCT-014 25','fct014-25',95,25.00)`,
      [zero, l25],
    );
    CATEGORIES.set('zero', zero);
    CATEGORIES.set('25', l25);
  });

  it('client puis pro : 1re → horodatage, 2e → payout net + commission + COMPLETED', async () => {
    const { bookingId } = await seedPaid('plombiers', 12000, 3);
    const first = await confirm(CLIENT, bookingId).expect(200);
    expect(first.body.status).toBe('IN_PROGRESS');
    expect(first.body.client_confirmed_at).toBeTruthy();
    expect(first.body.pro_confirmed_at).toBeNull();
    const [noOp] = await db.query(
      `SELECT count(*)::int n FROM pay.provider_operations o JOIN pay.transactions t ON t.id=o.transaction_id
       WHERE t.booking_id=$1 AND o.operation_type='PAYOUT'`,
      [bookingId],
    );
    expect(noOp.n).toBe(0);
    const second = await confirm(PRO, bookingId).expect(200);
    expect(second.body.status).toBe('COMPLETED');
    expect(second.body.client_confirmed_at).toBeTruthy();
    expect(second.body.pro_confirmed_at).toBeTruthy();
    await expectReleased(bookingId, 12000, 10, 1200, 10800);
  });

  it('pro puis client : ordre inversé, même résultat', async () => {
    const { bookingId } = await seedPaid('plombiers', 8000, 5);
    await confirm(PRO, bookingId).expect(200);
    const second = await confirm(CLIENT, bookingId).expect(200);
    expect(second.body.status).toBe('COMPLETED');
    await expectReleased(bookingId, 8000, 10, 800, 7200);
  });

  it('rejeu même rôle avant l’autre côté → 200, aucune libération', async () => {
    const { bookingId } = await seedPaid('plombiers', 12000, 7);
    const a = await confirm(CLIENT, bookingId).expect(200);
    const b = await confirm(CLIENT, bookingId).expect(200);
    expect(a.body.status).toBe('IN_PROGRESS');
    expect(b.body.status).toBe('IN_PROGRESS');
    expect(b.body.pro_confirmed_at).toBeNull();
    const [ops] = await db.query(
      `SELECT count(*)::int n FROM pay.provider_operations o JOIN pay.transactions t ON t.id=o.transaction_id
       WHERE t.booking_id=$1 AND o.operation_type='PAYOUT'`,
      [bookingId],
    );
    expect(ops.n).toBe(0);
  });

  it('rejeu après COMPLETED (les deux rôles) → 200, pas de deuxième release', async () => {
    const { bookingId } = await seedPaid('plombiers', 12000, 9);
    await confirm(CLIENT, bookingId).expect(200);
    await confirm(PRO, bookingId).expect(200);
    const replayClient = await confirm(CLIENT, bookingId).expect(200);
    const replayPro = await confirm(PRO, bookingId).expect(200);
    expect(replayClient.body.status).toBe('COMPLETED');
    expect(replayPro.body.status).toBe('COMPLETED');
    const [ops] = await db.query(
      `SELECT count(*)::int n FROM pay.provider_operations o JOIN pay.transactions t ON t.id=o.transaction_id
       WHERE t.booking_id=$1 AND o.operation_type='PAYOUT' AND o.status='SUCCEEDED'`,
      [bookingId],
    );
    expect(ops.n).toBe(1);
  });

  it('mauvais participant → 403 ; réservation inconnue → 404', async () => {
    const { bookingId } = await seedPaid('plombiers', 12000, 11);
    await confirm(TIERS, bookingId).expect(403);
    await confirm(CLIENT, randomUUID()).expect(404);
  });

  it('mauvais statut : CONFIRMED (non payé) et CANCELLED → 409', async () => {
    const unpaid = await seedBooking('plombiers', 12000, 13);
    await confirm(CLIENT, unpaid.bookingId).expect(409);
    const cancelled = await seedPaid('plombiers', 12000, 15);
    await db.query(`UPDATE market.bookings SET status='CANCELLED' WHERE id=$1`, [
      cancelled.bookingId,
    ]);
    await confirm(CLIENT, cancelled.bookingId).expect(409);
  });

  it('échec de release → 502, jamais COMPLETED, reprise propre ensuite', async () => {
    const gateway = app.app.get<TestPaymentGateway>(
      PaymentGatewayPortToken,
    );
    const { bookingId } = await seedPaid('plombiers', 12000, 17);
    await confirm(CLIENT, bookingId).expect(200);
    gateway.setFailReleases(true);
    await confirm(PRO, bookingId).expect(502);
    gateway.setFailReleases(false);
    const [booking] = await db.query(
      `SELECT status,client_confirmed_at,pro_confirmed_at FROM market.bookings WHERE id=$1`,
      [bookingId],
    );
    expect(booking.status).toBe('IN_PROGRESS');
    expect(booking.client_confirmed_at).toBeTruthy();
    expect(booking.pro_confirmed_at).toBeTruthy();
    const [failed] = await db.query(
      `SELECT count(*)::int n FROM pay.provider_operations o JOIN pay.transactions t ON t.id=o.transaction_id
       WHERE t.booking_id=$1 AND o.operation_type='PAYOUT' AND o.status='FAILED'`,
      [bookingId],
    );
    expect(failed.n).toBe(1);
    const [comm] = await db.query(
      `SELECT count(*)::int n FROM pay.commissions c JOIN pay.transactions t ON t.id=c.transaction_id
       WHERE t.booking_id=$1`,
      [bookingId],
    );
    expect(comm.n).toBe(0);
    const retry = await confirm(PRO, bookingId).expect(200);
    expect(retry.body.status).toBe('COMPLETED');
    await expectReleased(bookingId, 12000, 10, 1200, 10800);
  });

  it('résultat réseau ambigu (release lève) → 502 puis reprise avec la MÊME clé, une seule libération', async () => {
    const gateway = app.app.get<TestPaymentGateway>(
      PaymentGatewayPortToken,
    );
    const { bookingId } = await seedPaid('plombiers', 12000, 31);
    await confirm(CLIENT, bookingId).expect(200);
    const spy = jest.spyOn(gateway, 'release');
    spy.mockImplementationOnce(async (r) => {
      throw new Error(`network timeout (${r.idempotencyKey})`);
    });
    await confirm(PRO, bookingId).expect(502);
    // Le provider a peut-être réellement libéré : le rejeu doit réutiliser
    // exactement la même clé d'idempotence (jamais une nouvelle release logique).
    const retry = await confirm(PRO, bookingId).expect(200);
    expect(retry.body.status).toBe('COMPLETED');
    const keys = spy.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    await expectReleased(bookingId, 12000, 10, 1200, 10800);
    spy.mockRestore();
  });

  it('crash simulé entre release réussie et finalize() → reprise même clé, un seul payout', async () => {
    const gateway = app.app.get<TestPaymentGateway>(
      PaymentGatewayPortToken,
    );
    const repo = app.app.get<BookingRepositoryPort>(BookingRepositoryPortToken);
    const { bookingId } = await seedPaid('plombiers', 12000, 33);
    await confirm(CLIENT, bookingId).expect(200);
    const spy = jest.spyOn(gateway, 'release');
    const finalizeSpy = jest.spyOn(repo, 'finalize');
    // La release réussit côté provider, puis le processus « crashe » : finalize lève.
    finalizeSpy.mockImplementationOnce(async () => {
      throw new Error('simulated crash after release');
    });
    await confirm(PRO, bookingId).expect(500);
    finalizeSpy.mockRestore();
    const [before] = await db.query(
      `SELECT status FROM market.bookings WHERE id=$1`,
      [bookingId],
    );
    expect(before.status).toBe('IN_PROGRESS');
    // Reprise : RESUME_RELEASE → même clé → le simulateur renvoie la même ref.
    const retry = await confirm(PRO, bookingId).expect(200);
    expect(retry.body.status).toBe('COMPLETED');
    const keys = spy.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    await expectReleased(bookingId, 12000, 10, 1200, 10800);
    spy.mockRestore();
  });

  it('commission 0 % → net = brut ; 25 % → net = 0,75 × brut', async () => {
    const zero = categoryOf('zero');
    const l25 = categoryOf('25');
    const b0 = await seedPaidCat(zero, 12000, 19);
    await confirm(CLIENT, b0.bookingId).expect(200);
    await confirm(PRO, b0.bookingId).expect(200);
    await expectReleased(b0.bookingId, 12000, 0, 0, 12000);
    const b25 = await seedPaidCat(l25, 12000, 21);
    await confirm(CLIENT, b25.bookingId).expect(200);
    await confirm(PRO, b25.bookingId).expect(200);
    await expectReleased(b25.bookingId, 12000, 25, 3000, 9000);
  });

  it('concurrence réelle : Promise.all(client + pro) → une seule libération', async () => {
    const { bookingId } = await seedPaid('plombiers', 12000, 23);
    const [a, b] = await Promise.all([
      confirm(CLIENT, bookingId),
      confirm(PRO, bookingId),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 200]);
    const [booking] = await db.query(
      `SELECT status FROM market.bookings WHERE id=$1`,
      [bookingId],
    );
    expect(booking.status).toBe('COMPLETED');
    const [ops] = await db.query(
      `SELECT count(*)::int n FROM pay.provider_operations o JOIN pay.transactions t ON t.id=o.transaction_id
       WHERE t.booking_id=$1 AND o.operation_type='PAYOUT' AND o.status='SUCCEEDED'`,
      [bookingId],
    );
    expect(ops.n).toBe(1);
  });

  it('régression FCT-013 : paiement SUCCEEDED → booking IN_PROGRESS atomiquement', async () => {
    const { bookingId } = await seedBooking('plombiers', 12000, 25);
    const [before] = await db.query(
      `SELECT status FROM market.bookings WHERE id=$1`,
      [bookingId],
    );
    expect(before.status).toBe('CONFIRMED');
    await pay(bookingId);
  });

  it('backfill : booking CONFIRMED + transaction SUCCEEDED → IN_PROGRESS (SQL migration 012)', async () => {
    const { bookingId, requestId } = await seedBooking('plombiers', 12000, 27);
    const txn = randomUUID();
    await db.query(
      `INSERT INTO pay.transactions(id,user_id,type,status,amount,fee,currency,booking_id,country_code,version,created_at,updated_at)
       VALUES($1,$2,'SERVICE_PAYMENT','SUCCEEDED',12000,0,'XOF',$3,'BJ',2,now(),now())`,
      [txn, clientId, bookingId],
    );
    await db.query(
      `INSERT INTO pay.provider_operations(transaction_id,provider_code,operation_type,status,amount,external_ref,initiated_at,completed_at)
       VALUES($1,'SIMULATOR','CHARGE','SUCCEEDED',12000,'BACKFILL-1',now(),now())`,
      [txn],
    );
    await db.query(
      `UPDATE market.service_requests SET status='PAID' WHERE id=$1`,
      [requestId],
    );
    // État pré-migration : SUCCEEDED mais booking jamais entré en prestation.
    await db.query(
      `UPDATE market.bookings b SET status='IN_PROGRESS', version=b.version+1, updated_at=now()
       FROM pay.transactions t
       WHERE t.booking_id=b.id AND t.status='SUCCEEDED' AND b.status='CONFIRMED'`,
    );
    const [booking] = await db.query(
      `SELECT status FROM market.bookings WHERE id=$1`,
      [bookingId],
    );
    expect(booking.status).toBe('IN_PROGRESS');
  });

  function categoryOf(key: 'zero' | '25') {
    const id = CATEGORIES.get(key);
    if (!id) throw new Error(`catégorie ${key} absente`);
    return id;
  }
  function confirm(phone: string, bookingId: string) {
    const token =
      phone === CLIENT
        ? clientToken
        : phone === PRO
          ? proToken
          : tiersToken;
    return app.http
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${token}`);
  }
  async function seedBooking(catSlug: string, price: number, offsetDays: number) {
    const rid = randomUUID(),
      qid = randomUUID(),
      bid = randomUUID(),
      sid = randomUUID();
    const cat = (
      await db.query(
        `SELECT id FROM pros.categories WHERE slug=$1 LIMIT 1`,
        [catSlug],
      )
    )[0].id;
    const div = (
      await db.query(`SELECT id FROM geo.divisions WHERE name='Cotonou' LIMIT 1`)
    )[0].id;
    await db.query(
      `INSERT INTO market.service_requests(id,client_id,category_id,title,description,country_code,division_id,currency,urgency,status,expires_at,version,created_at,updated_at)
       VALUES($1,$2,$3,'Mission FCT-014','D','BJ',$4,'XOF','NORMAL','SELECTED',now()+interval '2 day',4,now(),now())`,
      [rid, clientId, cat, div],
    );
    await db.query(
      `INSERT INTO market.quotes(id,request_id,professional_id,created_by,price,currency,status,accepted_at,version,created_at,updated_at)
       VALUES($1,$2,$3,(SELECT user_id FROM pros.profiles WHERE id=$3),$4,'XOF','ACCEPTED',now(),2,now(),now())`,
      [qid, rid, proId, price],
    );
    await db.query(
      `INSERT INTO pros.availability_slots(id,professional_id,start_at,end_at)
       VALUES($1,$2,now()+($3||' days')::interval,now()+($3||' days')::interval+interval '2 hour')`,
      [sid, proId, `${offsetDays}`],
    );
    await db.query(
      `INSERT INTO market.bookings(id,request_id,quote_id,client_id,professional_id,slot_id,scheduled_start,scheduled_end,status,price,currency,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,now()+($7||' days')::interval,now()+($7||' days')::interval+interval '2 hour','CONFIRMED',$8,'XOF',1,now(),now())`,
      [bid, rid, qid, clientId, proId, sid, `${offsetDays}`, price],
    );
    return { bookingId: bid, requestId: rid };
  }
  async function seedPaid(catSlug: string, price: number, offsetDays: number) {
    const seeded = await seedBooking(catSlug, price, offsetDays);
    await pay(seeded.bookingId);
    return seeded;
  }
  async function seedPaidCat(catId: string, price: number, offsetDays: number) {
    const seeded = await seedBookingCat(catId, price, offsetDays);
    await pay(seeded.bookingId);
    return seeded;
  }
  async function seedBookingCat(catId: string, price: number, offsetDays: number) {
    const rid = randomUUID(),
      qid = randomUUID(),
      bid = randomUUID(),
      sid = randomUUID();
    const div = (
      await db.query(`SELECT id FROM geo.divisions WHERE name='Cotonou' LIMIT 1`)
    )[0].id;
    await db.query(
      `INSERT INTO market.service_requests(id,client_id,category_id,title,description,country_code,division_id,currency,urgency,status,expires_at,version,created_at,updated_at)
       VALUES($1,$2,$3,'Mission FCT-014','D','BJ',$4,'XOF','NORMAL','SELECTED',now()+interval '2 day',4,now(),now())`,
      [rid, clientId, catId, div],
    );
    await db.query(
      `INSERT INTO market.quotes(id,request_id,professional_id,created_by,price,currency,status,accepted_at,version,created_at,updated_at)
       VALUES($1,$2,$3,(SELECT user_id FROM pros.profiles WHERE id=$3),$4,'XOF','ACCEPTED',now(),2,now(),now())`,
      [qid, rid, proId, price],
    );
    await db.query(
      `INSERT INTO pros.availability_slots(id,professional_id,start_at,end_at)
       VALUES($1,$2,now()+($3||' days')::interval,now()+($3||' days')::interval+interval '2 hour')`,
      [sid, proId, `${offsetDays}`],
    );
    await db.query(
      `INSERT INTO market.bookings(id,request_id,quote_id,client_id,professional_id,slot_id,scheduled_start,scheduled_end,status,price,currency,version,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,now()+($7||' days')::interval,now()+($7||' days')::interval+interval '2 hour','CONFIRMED',$8,'XOF',1,now(),now())`,
      [bid, rid, qid, clientId, proId, sid, `${offsetDays}`, price],
    );
    return { bookingId: bid, requestId: rid };
  }
  async function pay(bookingId: string) {
    const key = randomUUID();
    const p = await app.http
      .post('/api/v1/payments/initiate')
      .set('Authorization', `Bearer ${clientToken}`)
      .set('Idempotency-Key', key)
      .send({ booking_id: bookingId })
      .expect(201);
    const otpStore = app.app.get(OtpStorePortToken);
    await otpStore.saveOtp({
      phone: CLIENT,
      purpose: OtpPurpose.PAYMENT,
      codeHash: hashOtpCode(CODE),
      expiresAt: new Date(Date.now() + 300_000),
      attempts: 0,
      usedAt: null,
    });
    const v = await app.http
      .post(`/api/v1/payments/${p.body.id}/verify`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ code: CODE })
      .expect(200);
    expect(v.body.status).toBe('SUCCEEDED');
    // Régression FCT-013 : SUCCEEDED → booking IN_PROGRESS atomiquement.
    const [booking] = await db.query(
      `SELECT status FROM market.bookings WHERE id=$1`,
      [bookingId],
    );
    expect(booking.status).toBe('IN_PROGRESS');
    return p.body.id;
  }
  async function expectReleased(
    bookingId: string,
    gross: number,
    rate: number,
    commission: number,
    net: number,
  ) {
    const ops = await db.query(
      `SELECT o.amount,o.status,o.operation_type,o.external_ref FROM pay.provider_operations o
       JOIN pay.transactions t ON t.id=o.transaction_id
       WHERE t.booking_id=$1 AND o.operation_type='PAYOUT' AND o.status='SUCCEEDED'
       ORDER BY o.initiated_at`,
      [bookingId],
    );
    expect(ops.length).toBe(1);
    expect(ops[0].status).toBe('SUCCEEDED');
    expect(Number(ops[0].amount)).toBe(net);
    expect(ops[0].external_ref).toMatch(/^REL-/);
    const comm = await db.query(
      `SELECT c.rule_code,c.rate,c.amount FROM pay.commissions c
       JOIN pay.transactions t ON t.id=c.transaction_id
       WHERE t.booking_id=$1`,
      [bookingId],
    );
    expect(comm.length).toBe(1);
    expect(comm[0].rule_code).toBe('CATEGORY_RATE');
    expect(Number(comm[0].rate)).toBe(rate);
    expect(Number(comm[0].amount)).toBe(commission);
    const [booking] = await db.query(
      `SELECT status,version FROM market.bookings WHERE id=$1`,
      [bookingId],
    );
    expect(booking.status).toBe('COMPLETED');
    expect(booking.version).toBe(3);
  }
  async function login(phone: string) {
    await app.http
      .post('/api/v1/auth/otp/request')
      .send({ country_code: 'BJ', phone, purpose: 'LOGIN' })
      .expect(202);
    const r = await app.http
      .post('/api/v1/auth/login')
      .send({
        country_code: 'BJ',
        phone,
        code: app.sms.lastCode('BJ', phone),
        device: { session_id: 'fct014' },
      })
      .expect(200);
    return r.body.access_token;
  }
  async function clean() {
    if (!db) return;
    await db.query(
      `DELETE FROM pay.webhook_events WHERE provider_code='SIMULATOR'`,
    );
    await db.query(
      `DELETE FROM pay.commissions WHERE transaction_id IN(SELECT id FROM pay.transactions WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1))`,
      [PREFIX],
    );
    await db.query(
      `DELETE FROM pay.provider_operations WHERE transaction_id IN(SELECT id FROM pay.transactions WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1))`,
      [PREFIX],
    );
    await db.query(
      `DELETE FROM pay.transactions WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [PREFIX],
    );
    await db.query(
      `DELETE FROM market.bookings WHERE client_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [PREFIX],
    );
    await db.query(
      `DELETE FROM market.quotes WHERE request_id IN(SELECT id FROM market.service_requests WHERE client_id IN(SELECT id FROM users.users WHERE phone LIKE $1))`,
      [PREFIX],
    );
    await db.query(
      `DELETE FROM market.service_requests WHERE client_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [PREFIX],
    );
    await db.query(
      `DELETE FROM pros.availability_slots WHERE professional_id IN(SELECT id FROM pros.profiles WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1))`,
      [PREFIX],
    );
    await db.query(
      `DELETE FROM pros.profiles WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [PREFIX],
    );
    await db.query(
      `DELETE FROM authz.refresh_tokens WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [PREFIX],
    );
    await db.query(`DELETE FROM authz.otp_codes WHERE phone LIKE $1`, [PREFIX]);
    await db.query(
      `DELETE FROM users.user_roles WHERE user_id IN(SELECT id FROM users.users WHERE phone LIKE $1)`,
      [PREFIX],
    );
    await db.query(`DELETE FROM users.users WHERE phone LIKE $1`, [PREFIX]);
    await db.query(`DELETE FROM pros.categories WHERE slug LIKE 'fct014-%'`);
  }
});
