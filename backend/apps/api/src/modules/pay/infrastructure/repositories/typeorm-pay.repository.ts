/**
 * TCHATCHA — Implémentation TypeORM du port pay (FCT-013).
 * SQL brut, transaction unique : SUCCEEDED et SELECTED→PAID sont atomiques.
 * L'UPDATE conditionnel verrouille la ligne transaction : deux confirmations
 * concurrentes du même paiement sérialisent, une seule gagne (l'autre → 409).
 */
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  AuthorizeResult,
  ConfirmResult,
  CreatePaymentResult,
  MarkFailedResult,
  PaymentView,
  PayRepositoryPort,
  WebhookRecordInput,
} from '../../application/ports/pay-repository.port';

const VIEW_COLUMNS = `id,type,status,amount,currency,booking_id,country_code,version,created_at`;

@Injectable()
export class TypeOrmPayRepository implements PayRepositoryPort {
  constructor(private readonly db: DataSource) {}
  async isActiveClient(userId: string) {
    const r = await this.db.query(
      `SELECT 1 FROM users.users u JOIN users.user_roles ur ON ur.user_id=u.id AND ur.role='CLIENT' WHERE u.id=$1 AND u.status='ACTIVE' AND u.deleted_at IS NULL AND u.anonymized_at IS NULL`,
      [userId],
    );
    return !!r[0];
  }
  async createPayment(
    userId: string,
    c: { bookingId: string; idempotencyKey: string; requestHash: string },
  ): Promise<CreatePaymentResult> {
    return this.db.transaction('SERIALIZABLE', async (m) => {
      const prior = await m.query(
        `SELECT id FROM pay.transactions WHERE user_id=$1 AND client_idempotency_key=$2`,
        [userId, c.idempotencyKey],
      );
      if (prior[0]) {
        const hash = (
          await m.query(
            `SELECT client_request_hash FROM pay.transactions WHERE id=$1`,
            [prior[0].id],
          )
        )[0];
        if (hash.client_request_hash !== c.requestHash)
          return 'IDEMPOTENCY_MISMATCH' as const;
        return this.read(m, prior[0].id);
      }
      const paid = await m.query(
        `SELECT 1 FROM pay.transactions WHERE booking_id=$1 AND status='SUCCEEDED'`,
        [c.bookingId],
      );
      if (paid[0]) return 'ALREADY_SUCCEEDED' as const;
      const ctx = await m.query(
        `SELECT b.id,b.price,b.currency,b.status booking_status,u.phone,u.country_code,r.id request_id,r.status request_status,q.status quote_status
         FROM market.bookings b
         JOIN market.quotes q ON q.id=b.quote_id
         JOIN market.service_requests r ON r.id=q.request_id
         JOIN users.users u ON u.id=$2
         WHERE b.id=$1 AND b.client_id=$2 AND q.deleted_at IS NULL AND r.deleted_at IS NULL
         FOR UPDATE OF b,r,q`,
        [c.bookingId, userId],
      );
      if (!ctx[0]) return 'NOT_FOUND' as const;
      const x = ctx[0];
      // Montant/devise toujours issues du serveur (booking ← devis accepté).
      if (
        x.booking_status !== 'CONFIRMED' ||
        x.quote_status !== 'ACCEPTED' ||
        x.request_status !== 'SELECTED'
      )
        return 'ILLEGAL_TRANSITION' as const;
      try {
        const ins = await m.query(
          `INSERT INTO pay.transactions(user_id,type,status,amount,fee,currency,booking_id,country_code,version,client_idempotency_key,client_request_hash)
           VALUES($1,'SERVICE_PAYMENT','PENDING',$2,0,$3,$4,$5,1,$6,$7) RETURNING id`,
          [
            userId,
            x.price,
            x.currency,
            c.bookingId,
            x.country_code,
            c.idempotencyKey,
            c.requestHash,
          ],
        );
        return this.read(m, ins[0].id);
      } catch (e) {
        const constraint = (e as { constraint?: string }).constraint;
        if (constraint === 'uq_transactions_booking_succeeded')
          return 'ALREADY_SUCCEEDED' as const;
        if (constraint === 'uq_transactions_client_idempotency') {
          const prior = await m.query(
            `SELECT id FROM pay.transactions WHERE user_id=$1 AND client_idempotency_key=$2`,
            [userId, c.idempotencyKey],
          );
          if (prior[0]) {
            const hash = (
              await m.query(
                `SELECT client_request_hash FROM pay.transactions WHERE id=$1`,
                [prior[0].id],
              )
            )[0];
            if (hash.client_request_hash === c.requestHash)
              return this.read(m, prior[0].id);
          }
          return 'IDEMPOTENCY_MISMATCH' as const;
        }
        throw e;
      }
    });
  }
  async bindOperation(
    transactionId: string,
    providerCode: string,
    externalRef: string,
  ) {
    await this.db.query(
      `INSERT INTO pay.provider_operations(transaction_id,provider_code,operation_type,status,amount,external_ref,initiated_at)
       SELECT $1,$2,'CHARGE','PENDING',amount,$3,now() FROM pay.transactions WHERE id=$1`,
      [transactionId, providerCode, externalRef],
    );
  }
  async findById(userId: string, paymentId: string) {
    const r = await this.db.query(
      `SELECT ${VIEW_COLUMNS},(SELECT phone FROM users.users WHERE id=user_id) payer_phone
       FROM pay.transactions WHERE id=$1 AND user_id=$2`,
      [paymentId, userId],
    );
    return r[0] ? this.map(r[0]) : null;
  }
  async authorize(paymentId: string): Promise<AuthorizeResult> {
    // PostgresQueryRunner: UPDATE → [rows, rowCount] (le premier élément est le
    // tableau des lignes, vide si aucune ligne n'a été modifiée).
    const [rows] = await this.db.query(
      `UPDATE pay.transactions SET status='AUTHORIZED',version=version+1,updated_at=now()
       WHERE id=$1 AND status='PENDING' RETURNING id`,
      [paymentId],
    );
    if (rows[0]) return 'AUTHORIZED';
    const s = (
      await this.db.query(`SELECT status FROM pay.transactions WHERE id=$1`, [
        paymentId,
      ])
    )[0] as { status: string } | undefined;
    if (!s) return 'NOT_FOUND';
    if (s.status === 'SUCCEEDED') return 'ALREADY_SUCCEEDED';
    return 'FAILED';
  }
  async confirm(paymentId: string): Promise<ConfirmResult> {
    return this.db.transaction(async (m) => {
      const [rows] = await m.query(
        `UPDATE pay.transactions SET status='SUCCEEDED',version=version+1,updated_at=now()
         WHERE id=$1 AND status IN('PENDING','AUTHORIZED') RETURNING id`,
        [paymentId],
      );
      if (rows[0]) {
        await m.query(
          `UPDATE pay.provider_operations SET status='SUCCEEDED',completed_at=now()
           WHERE transaction_id=$1 AND status='PENDING'`,
          [paymentId],
        );
        const req = await m.query(
          `UPDATE market.service_requests sr SET status='PAID',version=sr.version+1,updated_at=now()
           FROM pay.transactions t
           JOIN market.bookings b ON b.id=t.booking_id
           JOIN market.quotes q ON q.id=b.quote_id
           WHERE q.request_id=sr.id AND t.id=$1 AND sr.status='SELECTED' AND sr.deleted_at IS NULL
           RETURNING sr.id`,
          [paymentId],
        );
        if (!req[0][0]) throw new RollbackSignal('REQUEST_ILLEGRAL_TRANSITION');
        // FCT-014 (RF-BK-01) : le paiement réussi entre le booking en
        // prestation, atomiquement avec SELECTED → PAID (06-schema-base L212).
        const bk = await m.query(
          `UPDATE market.bookings b SET status='IN_PROGRESS',version=b.version+1,updated_at=now()
           FROM pay.transactions t
           WHERE t.id=$1 AND b.id=t.booking_id AND b.status='CONFIRMED'
           RETURNING b.id`,
          [paymentId],
        );
        if (!bk[0][0]) throw new RollbackSignal('BOOKING_ILLEGAL_TRANSITION');
        return 'CONFIRMED' as const;
      }
      const s = (
        await m.query(`SELECT status FROM pay.transactions WHERE id=$1`, [
          paymentId,
        ])
      )[0] as { status: string } | undefined;
      if (!s) return 'NOT_FOUND' as const;
      if (s.status === 'SUCCEEDED') return 'ALREADY_SUCCEEDED' as const;
      return 'FAILED' as const;
    }).catch((e) => {
      if (e instanceof RollbackSignal) return e.reason as ConfirmResult;
      throw e;
    });
  }
  async markFailed(paymentId: string): Promise<MarkFailedResult> {
    return this.db.transaction(async (m) => {
      const [rows] = await m.query(
        `UPDATE pay.transactions SET status='FAILED',version=version+1,updated_at=now()
         WHERE id=$1 AND status IN('PENDING','AUTHORIZED') RETURNING id`,
        [paymentId],
      );
      if (rows[0]) {
        await m.query(
          `UPDATE pay.provider_operations SET status='FAILED',completed_at=now()
           WHERE transaction_id=$1 AND status='PENDING'`,
          [paymentId],
        );
        return 'FAILED' as const;
      }
      const s = (
        await m.query(`SELECT status FROM pay.transactions WHERE id=$1`, [
          paymentId,
        ])
      )[0] as { status: string } | undefined;
      if (!s) return 'NOT_FOUND' as const;
      return 'NOOP' as const;
    });
  }
  async resolveTransaction(providerCode: string, externalRef: string) {
    const r = await this.db.query(
      `SELECT t.id FROM pay.provider_operations po JOIN pay.transactions t ON t.id=po.transaction_id
       WHERE po.provider_code=$1 AND po.external_ref=$2`,
      [providerCode, externalRef],
    );
    return r[0] ? { id: String(r[0].id) } : null;
  }
  async recordWebhook(input: WebhookRecordInput) {
    try {
      await this.db.query(
        `INSERT INTO pay.webhook_events(provider_code,external_ref,event_type,payload)
         VALUES($1,$2,$3,$4)`,
        [input.providerCode, input.externalRef, input.eventType, input.payload],
      );
      return 'INSERTED' as const;
    } catch (e) {
      if ((e as { constraint?: string }).constraint === 'uq_webhook_events')
        return 'DUPLICATE' as const;
      throw e;
    }
  }
  async markWebhookProcessed(
    providerCode: string,
    externalRef: string,
    eventType: string,
    error: string | null,
  ) {
    await this.db.query(
      `UPDATE pay.webhook_events SET processed_at=now(),processing_error=$4
       WHERE provider_code=$1 AND external_ref=$2 AND event_type=$3 AND processed_at IS NULL`,
      [providerCode, externalRef, eventType, error],
    );
  }
  private map(r: Record<string, unknown>): PaymentView {
    return {
      id: String(r.id),
      type: String(r.type),
      status: String(r.status),
      amount: Number(r.amount),
      currency: String(r.currency),
      booking_id: String(r.booking_id),
      payer_phone: String(r.payer_phone),
      country_code: String(r.country_code),
      version: Number(r.version),
      created_at: new Date(r.created_at as string).toISOString(),
    };
  }
  private async read(
    m: import('typeorm').EntityManager,
    id: string,
  ): Promise<PaymentView> {
    const r = (
      await m.query(
        `SELECT ${VIEW_COLUMNS},(SELECT phone FROM users.users WHERE id=user_id) payer_phone
         FROM pay.transactions WHERE id=$1`,
        [id],
      )
    )[0] as Record<string, unknown>;
    return this.map(r);
  }
}

class RollbackSignal extends Error {
  constructor(readonly reason: string) {
    super(`rollback: ${reason}`);
    this.name = 'RollbackSignal';
  }
}