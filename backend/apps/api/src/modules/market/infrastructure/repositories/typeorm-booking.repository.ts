import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type {
  BookingRepositoryPort,
  BookingView,
  CreateBookingCommand,
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
      price: Number(r.price),
      currency: String(r.currency),
      version: Number(r.version),
    };
  }
}
