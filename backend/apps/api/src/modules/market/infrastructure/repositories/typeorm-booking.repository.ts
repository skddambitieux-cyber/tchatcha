import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type {
  BookingRepositoryPort,
  BookingView,
  ConfirmProgressResult,
  CreateBookingCommand,
  FinalizeResult,
  ReleaseIntent,
  ReleaseOutcome,
} from '../../application/ports/booking-repository.port';
@Injectable()
export class TypeOrmBookingRepository implements BookingRepositoryPort {
  constructor(private readonly db: DataSource) {}
  async isActiveClient(userId: string) {
    const r = await this.db.query(
      `SELECT 1 FROM users.users u JOIN users.user_roles ur ON ur.user_id=u.id AND ur.role='CLIENT' WHERE u.id=$1 AND u.status='ACTIVE' AND u.deleted_at IS NULL AND u.anonymized_at IS NULL`,
      [userId],
    );
    return !!r[0];
  }
  async listSlots(proId: string, from: Date, to: Date) {
    const r = await this.db.query(
      `SELECT s.id,s.start_at,s.end_at,s.version FROM pros.availability_slots s
  JOIN pros.profiles p ON p.id=s.professional_id WHERE s.professional_id=$1 AND s.active=true AND p.status='ACTIVE' AND p.deleted_at IS NULL
  AND s.start_at>now() AND s.start_at>=$2 AND s.end_at<=$3
  AND NOT EXISTS(SELECT 1 FROM pros.availability_overrides o WHERE o.professional_id=s.professional_id AND tstzrange(o.start_at,o.end_at,'[)')&&tstzrange(s.start_at,s.end_at,'[)'))
  AND NOT EXISTS(SELECT 1 FROM market.bookings b WHERE b.professional_id=s.professional_id AND b.status IN('CONFIRMED','IN_PROGRESS') AND tstzrange(b.scheduled_start,b.scheduled_end,'[)')&&tstzrange(s.start_at,s.end_at,'[)')) ORDER BY s.start_at,s.id`,
      [proId, from, to],
    );
    return r.map((x: Record<string, unknown>) => ({
      id: String(x.id),
      start: new Date(x.start_at as string).toISOString(),
      end: new Date(x.end_at as string).toISOString(),
      version: Number(x.version),
    }));
  }
  async create(userId: string, c: CreateBookingCommand) {
    return this.db.transaction('SERIALIZABLE', async (m) => {
      const prior = await m.query(
        `SELECT id,client_request_hash FROM market.bookings WHERE client_id=$1 AND client_idempotency_key=$2`,
        [userId, c.idempotencyKey],
      );
      if (prior[0]) {
        if (prior[0].client_request_hash !== c.requestHash)
          return 'IDEMPOTENCY_MISMATCH' as const;
        return this.read(m, prior[0].id);
      }
      const ctx = await m.query(
        `SELECT q.request_id,q.professional_id,q.price,q.currency,q.status quote_status,q.version quote_version,
   r.status request_status,r.version request_version,r.client_id,s.start_at,s.end_at,s.version slot_version,s.active
   FROM market.quotes q JOIN market.service_requests r ON r.id=q.request_id JOIN pros.availability_slots s ON s.id=$2 AND s.professional_id=q.professional_id
   WHERE q.id=$1 AND r.client_id=$3 AND q.deleted_at IS NULL FOR UPDATE OF q,r,s`,
        [c.quoteId, c.slotId, userId],
      );
      if (!ctx[0]) return 'NOT_FOUND' as const;
      const x = ctx[0];
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `schedule:${x.professional_id}`,
      ]);
      if (
        Number(x.quote_version) !== c.quoteVersion ||
        Number(x.request_version) !== c.requestVersion ||
        Number(x.slot_version) !== c.slotVersion
      )
        return 'VERSION_CONFLICT' as const;
      if (
        x.quote_status !== 'ACCEPTED' ||
        x.request_status !== 'SELECTED' ||
        !x.active ||
        new Date(x.start_at) <= new Date()
      )
        return 'ILLEGAL_TRANSITION' as const;
      const blocked = await m.query(
        `SELECT 1 FROM pros.availability_overrides WHERE professional_id=$1 AND tstzrange(start_at,end_at,'[)')&&tstzrange($2,$3,'[)')`,
        [x.professional_id, x.start_at, x.end_at],
      );
      if (blocked[0]) return 'SLOT_CONFLICT' as const;
      try {
        const ins = await m.query(
          `INSERT INTO market.bookings(request_id,quote_id,client_id,professional_id,slot_id,scheduled_start,scheduled_end,status,price,currency,version,client_idempotency_key,client_request_hash)
   VALUES($1,$2,$3,$4,$5,$6,$7,'CONFIRMED',$8,$9,1,$10,$11) RETURNING id`,
          [
            x.request_id,
            c.quoteId,
            userId,
            x.professional_id,
            c.slotId,
            x.start_at,
            x.end_at,
            x.price,
            x.currency,
            c.idempotencyKey,
            c.requestHash,
          ],
        );
        return this.read(m, ins[0].id);
      } catch (e) {
        if (['23505', '23P01'].includes((e as { code?: string }).code ?? ''))
          return 'SLOT_CONFLICT' as const;
        throw e;
      }
    });
  }
  async confirm(bookingId: string, userId: string): Promise<ConfirmProgressResult> {
    return this.db.transaction(async (m) => {
      const exists = (
        await m.query(`SELECT 1 FROM market.bookings WHERE id=$1`, [bookingId])
      )[0];
      if (!exists) return { kind: 'NOT_FOUND' } as const;
      const row = (
        await m.query(
          `SELECT b.id,b.status,b.client_confirmed_at,b.pro_confirmed_at,
                  b.price,b.currency,
                  c.commission_rate,
                  ROUND(b.price*c.commission_rate/100,2) AS commission_amount,
                  b.price-ROUND(b.price*c.commission_rate/100,2) AS net_amount,
                  t.id AS txn_id, t.country_code,
                  (SELECT u.phone FROM users.users u
                    WHERE u.id=(SELECT p.user_id FROM pros.profiles p WHERE p.id=b.professional_id)) AS pro_phone,
                  EXISTS(SELECT 1 FROM pros.profiles p WHERE p.id=b.professional_id AND p.user_id=$2) AS is_pro
           FROM market.bookings b
           JOIN market.service_requests r ON r.id=b.request_id
           JOIN pros.categories c ON c.id=r.category_id
           LEFT JOIN pay.transactions t ON t.booking_id=b.id AND t.status='SUCCEEDED'
           WHERE b.id=$1 AND (b.client_id=$2
             OR EXISTS(SELECT 1 FROM pros.profiles p WHERE p.id=b.professional_id AND p.user_id=$2))
           FOR UPDATE OF b`,
          [bookingId, userId],
        )
      )[0];
      if (!row) return { kind: 'FORBIDDEN' } as const;
      if (row.status === 'COMPLETED')
        return { kind: 'ALREADY_COMPLETED', view: await this.read(m, bookingId) };
      if (row.status !== 'IN_PROGRESS' || !row.txn_id)
        return { kind: 'ILLEGAL_STATE', view: await this.read(m, bookingId) };
      const roleCol: 'client_confirmed_at' | 'pro_confirmed_at' = row.is_pro
        ? 'pro_confirmed_at'
        : 'client_confirmed_at';
      const otherCol: 'client_confirmed_at' | 'pro_confirmed_at' = row.is_pro
        ? 'client_confirmed_at'
        : 'pro_confirmed_at';
      if (row[roleCol]) {
        if (row[otherCol])
          return {
            kind: 'RESUME_RELEASE',
            view: await this.read(m, bookingId),
            release: this.buildIntent(row),
          };
        return {
          kind: 'ALREADY_CONFIRMED',
          view: await this.read(m, bookingId),
        };
      }
      const up = await m.query(
        `UPDATE market.bookings SET ${roleCol}=now(),updated_at=now() WHERE id=$1 AND ${roleCol} IS NULL`,
        [bookingId],
      );
      if (!up[0][0]) {
        const s = (
          await m.query(
            `SELECT client_confirmed_at,pro_confirmed_at FROM market.bookings WHERE id=$1`,
            [bookingId],
          )
        )[0];
        if (s.client_confirmed_at && s.pro_confirmed_at)
          return {
            kind: 'RESUME_RELEASE',
            view: await this.read(m, bookingId),
            release: this.buildIntent(row),
          };
        return {
          kind: 'ALREADY_CONFIRMED',
          view: await this.read(m, bookingId),
        };
      }
      const after = (
        await m.query(
          `SELECT client_confirmed_at,pro_confirmed_at FROM market.bookings WHERE id=$1`,
          [bookingId],
        )
      )[0];
      // Vue lue APRÈS l'UPDATE du timestamp (état frais, y compris le rejeu).
      const fresh = await this.read(m, bookingId);
      if (after.client_confirmed_at && after.pro_confirmed_at)
        return { kind: 'SECOND_CONFIRMED', view: fresh, release: this.buildIntent(row) };
      return { kind: 'FIRST_CONFIRMED', view: fresh };
    });
  }
  async finalize(
    bookingId: string,
    intent: ReleaseIntent,
    outcome: ReleaseOutcome,
  ): Promise<FinalizeResult> {
    return this.db.transaction(async (m) => {
      const row = (
        await m.query(
          `SELECT status,client_confirmed_at,pro_confirmed_at FROM market.bookings WHERE id=$1 FOR UPDATE`,
          [bookingId],
        )
      )[0];
      if (!row || row.status === 'COMPLETED')
        return { kind: 'ALREADY_COMPLETED', view: await this.read(m, bookingId) };
      if (
        row.status !== 'IN_PROGRESS' ||
        !row.client_confirmed_at ||
        !row.pro_confirmed_at
      )
        return { kind: 'RELEASE_FAILED', view: await this.read(m, bookingId) };
      const view = await this.read(m, bookingId);
      if (outcome.status === 'FAILED') {
        await m.query(
          `INSERT INTO pay.provider_operations(transaction_id,provider_code,operation_type,status,amount,response_payload,initiated_at,completed_at)
           VALUES($1,$2,'PAYOUT','FAILED',$3,$4::jsonb,now(),now())`,
          [
            intent.transactionId,
            outcome.providerCode,
            intent.amount,
            JSON.stringify({ failure_reason: outcome.failureReason ?? null }),
          ],
        );
        return { kind: 'RELEASE_FAILED', view };
      }
      try {
        await m.query(
          `INSERT INTO pay.provider_operations(transaction_id,provider_code,operation_type,status,amount,external_ref,initiated_at,completed_at)
           VALUES($1,$2,'PAYOUT','SUCCEEDED',$3,$4,now(),now())`,
          [
            intent.transactionId,
            outcome.providerCode,
            intent.amount,
            outcome.externalRef ?? null,
          ],
        );
        await m.query(
          `INSERT INTO pay.commissions(transaction_id,rule_code,rate,amount,computed_at)
           VALUES($1,'CATEGORY_RATE',$2,$3,now())`,
          [
            intent.transactionId,
            intent.commissionRate,
            intent.commissionAmount,
          ],
        );
        const bk = await m.query(
          `UPDATE market.bookings SET status='COMPLETED',version=version+1,updated_at=now()
           WHERE id=$1 AND status='IN_PROGRESS'
             AND client_confirmed_at IS NOT NULL AND pro_confirmed_at IS NOT NULL
           RETURNING id`,
          [bookingId],
        );
        if (!bk[0][0]) throw new RollbackSignal('BOOKING_ALREADY_COMPLETED');
        return { kind: 'COMPLETED', view: await this.read(m, bookingId) };
      } catch (e) {
        if (
          (e as { constraint?: string }).constraint ===
          'uq_provider_ops_release_once'
        ) {
          // Une release SUCCEEDED existe déjà (fenêtre de crash) : l'opération
          // est la preuve de libération — la terminer, jamais en refaire une.
          await m.query(
            `UPDATE market.bookings SET status='COMPLETED',version=version+1,updated_at=now()
             WHERE id=$1 AND status='IN_PROGRESS'
               AND client_confirmed_at IS NOT NULL AND pro_confirmed_at IS NOT NULL`,
            [bookingId],
          );
          return { kind: 'ALREADY_COMPLETED', view: await this.read(m, bookingId) };
        }
        throw e;
      }
    });
  }
  private buildIntent(row: Record<string, unknown>): ReleaseIntent {
    return {
      bookingId: String(row.id),
      transactionId: String(row.txn_id),
      // Clé d'idempotence déterministe : l'identité du paiement. Stable pour le
      // booking (une seule transaction SUCCEEDED), identique à chaque rejeu.
      idempotencyKey: `payout:${String(row.txn_id)}`,
      amount: Number(row.net_amount),
      currency: String(row.currency),
      countryCode: String(row.country_code),
      beneficiaryPhone: row.pro_phone ? String(row.pro_phone) : null,
      commissionRate: Number(row.commission_rate),
      commissionAmount: Number(row.commission_amount),
    };
  }
  private async read(m: EntityManager, id: string): Promise<BookingView> {
    const r = (
      await m.query(
        `SELECT b.*,p.business_name FROM market.bookings b JOIN pros.profiles p ON p.id=b.professional_id WHERE b.id=$1`,
        [id],
      )
    )[0];
    return {
      id: String(r.id),
      request_id: String(r.request_id),
      quote_id: String(r.quote_id),
      slot_id: String(r.slot_id),
      professional: {
        id: String(r.professional_id),
        business_name: r.business_name ? String(r.business_name) : null,
      },
      scheduled_start: new Date(r.scheduled_start).toISOString(),
      scheduled_end: new Date(r.scheduled_end).toISOString(),
      status: String(r.status),
      client_confirmed_at: r.client_confirmed_at
        ? new Date(r.client_confirmed_at).toISOString()
        : null,
      pro_confirmed_at: r.pro_confirmed_at
        ? new Date(r.pro_confirmed_at).toISOString()
        : null,
      price: Number(r.price),
      currency: String(r.currency),
      version: Number(r.version),
    };
  }
}

class RollbackSignal extends Error {
  constructor(readonly reason: string) {
    super(`rollback: ${reason}`);
    this.name = 'RollbackSignal';
  }
}
