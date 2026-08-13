import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { BookingRepositoryPortToken } from '../ports/booking-repository.port';
import type { BookingRepositoryPort } from '../ports/booking-repository.port';
import {
  BookingIdempotencyMismatchError,
  BookingIllegalTransitionError,
  BookingInvalidError,
  BookingNotFoundError,
  BookingSlotConflictError,
  BookingVersionConflictError,
  RequestForbiddenError,
} from '../../domain/errors/request-errors';
import type {
  CreateBookingDto,
  ListSlotsDto,
} from '../../interface/http/dto/booking.dto';
@Injectable()
export class BookingService {
  constructor(
    @Inject(BookingRepositoryPortToken)
    private readonly repository: BookingRepositoryPort,
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
}
