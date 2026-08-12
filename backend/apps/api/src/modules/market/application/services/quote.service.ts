import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { QuoteRepositoryPortToken } from '../ports/quote-repository.port';
import type { CreateQuoteCommand, QuoteRepositoryPort } from '../ports/quote-repository.port';
import { ProfessionalRequiredError, QuoteActiveExistsError, QuoteIdempotencyMismatchError, QuoteInvalidError, RequestNotFoundError } from '../../domain/errors/request-errors';
import type { CreateQuoteDto } from '../../interface/http/dto/quote.dto';

@Injectable()
export class QuoteService {
  constructor(@Inject(QuoteRepositoryPortToken) private readonly repository: QuoteRepositoryPort) {}

  async create(userId: string, requestId: string, idempotencyKey: string | undefined, dto: CreateQuoteDto) {
    if (!(await this.repository.isPublishableProfessional(userId))) throw new ProfessionalRequiredError();
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
      throw new QuoteInvalidError('idempotency_key_required');
    }
    const normalized = {
      request_id: requestId,
      price: dto.price,
      duration_days: dto.duration_days ?? null,
      message: dto.message?.trim() || null,
    };
    const command: CreateQuoteCommand = {
      requestId, price: normalized.price, durationDays: normalized.duration_days,
      message: normalized.message, idempotencyKey,
      requestHash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
    };
    const result = await this.repository.create(userId, command);
    if (result === 'NOT_MATCHED') throw new RequestNotFoundError();
    if (result === 'ACTIVE_QUOTE_EXISTS') throw new QuoteActiveExistsError();
    if (result === 'IDEMPOTENCY_MISMATCH') throw new QuoteIdempotencyMismatchError();
    return result;
  }
}
