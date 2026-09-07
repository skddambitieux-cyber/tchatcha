import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { BookingRepositoryPortToken } from '../ports/booking-repository.port';
import type { BookingRepositoryPort } from '../ports/booking-repository.port';
import {
  BookingConfirmForbiddenError,
  BookingConfirmIllegalStateError,
  BookingIdempotencyMismatchError,
  BookingIllegalTransitionError,
  BookingInvalidError,
  BookingNotFoundError,
  BookingReleaseFailedError,
  BookingSlotConflictError,
  BookingVersionConflictError,
  RequestForbiddenError,
} from '../../domain/errors/request-errors';
import type {
  CreateBookingDto,
  ListSlotsDto,
} from '../../interface/http/dto/booking.dto';
import {
  PaymentGatewayPortToken,
  type GatewayReleaseResult,
  type PaymentGatewayPort,
} from '../../../pay/application/ports/payment-gateway.port';
@Injectable()
export class BookingService {
  constructor(
    @Inject(BookingRepositoryPortToken)
    private readonly repository: BookingRepositoryPort,
    @Inject(PaymentGatewayPortToken)
    private readonly gateway: PaymentGatewayPort,
  ) {}
  async slots(proId: string, dto: ListSlotsDto) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (to <= from || to.getTime() - from.getTime() > 31 * 86400000)
      throw new BookingInvalidError('invalid_slot_period');
    return { items: await this.repository.listSlots(proId, from, to) };
  }
  async create(userId: string, key: string | undefined, dto: CreateBookingDto) {
    if (!(await this.repository.isActiveClient(userId)))
      throw new RequestForbiddenError();
    if (!key || !/^[0-9a-f-]{36}$/i.test(key))
      throw new BookingInvalidError('idempotency_key_required');
    const normalized = {
      quote_id: dto.quote_id,
      slot_id: dto.slot_id,
      slot_version: dto.slot_version,
      quote_version: dto.quote_version,
      request_version: dto.request_version,
    };
    const result = await this.repository.create(userId, {
      quoteId: dto.quote_id,
      slotId: dto.slot_id,
      slotVersion: dto.slot_version,
      quoteVersion: dto.quote_version,
      requestVersion: dto.request_version,
      idempotencyKey: key,
      requestHash: createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex'),
    });
    if (result === 'NOT_FOUND') throw new BookingNotFoundError();
    if (result === 'ILLEGAL_TRANSITION')
      throw new BookingIllegalTransitionError();
    if (result === 'VERSION_CONFLICT') throw new BookingVersionConflictError();
    if (result === 'SLOT_CONFLICT') throw new BookingSlotConflictError();
    if (result === 'IDEMPOTENCY_MISMATCH')
      throw new BookingIdempotencyMismatchError();
    return result;
  }

  /**
   * FCT-014 — double confirmation (RF-BK-03..09). Frontière nette : l'appel
   * gateway.release() a lieu ENTRE deux transactions courtes du repository,
   * jamais dans une transaction (bug.md).
   */
  async confirm(userId: string, bookingId: string) {
    const r = await this.repository.confirm(bookingId, userId);
    switch (r.kind) {
      case 'NOT_FOUND':
        throw new BookingNotFoundError();
      case 'FORBIDDEN':
        throw new BookingConfirmForbiddenError();
      case 'ILLEGAL_STATE':
        throw new BookingConfirmIllegalStateError();
      case 'FIRST_CONFIRMED':
      case 'ALREADY_CONFIRMED':
      case 'ALREADY_COMPLETED':
        return r.view;
      case 'SECOND_CONFIRMED':
      case 'RESUME_RELEASE': {
        const outcome: GatewayReleaseResult = await this.gateway
          .release({
            reference: r.release.transactionId,
            // Clé d'idempotence stable : les retries (502 → rejeu) réutilisent
            // exactement la même clé → jamais deux libérations logiques.
            idempotencyKey: r.release.idempotencyKey,
            amount: r.release.amount,
            currency: r.release.currency,
            countryCode: r.release.countryCode,
            beneficiaryPhone: r.release.beneficiaryPhone,
          })
          .catch(() => ({
            status: 'FAILED' as const,
            providerCode: 'SIMULATOR',
            failureReason: 'gateway_unreachable',
          }));
        const fin = await this.repository.finalize(
          r.release.bookingId,
          r.release,
          outcome,
        );
        if (fin.kind === 'RELEASE_FAILED')
          throw new BookingReleaseFailedError();
        return fin.view;
      }
    }
  }
}
