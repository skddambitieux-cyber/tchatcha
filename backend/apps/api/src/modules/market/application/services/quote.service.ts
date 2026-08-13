import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { QuoteRepositoryPortToken } from '../ports/quote-repository.port';
import type { AcceptQuoteCommand, CounterOfferCommand, CreateQuoteCommand, QuoteDetailView, QuoteRepositoryPort } from '../ports/quote-repository.port';
import { ProfessionalRequiredError, QuoteAcceptanceConflictError, QuoteActiveExistsError, QuoteIdempotencyMismatchError, QuoteIllegalTransitionError, QuoteInvalidError, QuoteNegotiationLimitError, QuoteNotFoundError, QuoteSameActorError, QuoteVersionConflictError, RequestForbiddenError, RequestNotFoundError } from '../../domain/errors/request-errors';
import type { AcceptQuoteDto, CounterOfferDto, CreateQuoteDto } from '../../interface/http/dto/quote.dto';

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

  async listReceived(userId: string, requestId: string, limit: number, cursorValue?: string) {
    if (!(await this.repository.isActiveClient(userId))) throw new RequestForbiddenError();
    const rows = await this.repository.listReceived(userId, requestId, limit + 1,
      cursorValue ? this.decodeCursor(cursorValue) : undefined);
    if (rows === 'NOT_FOUND') throw new RequestNotFoundError();
    return this.page(rows, limit);
  }

  async listSent(userId: string, limit: number, cursorValue?: string) {
    if (!(await this.repository.isActiveProfessional(userId))) throw new ProfessionalRequiredError();
    const rows = await this.repository.listSent(userId, limit + 1,
      cursorValue ? this.decodeCursor(cursorValue) : undefined);
    return this.page(rows, limit);
  }

  async detail(userId: string, quoteId: string) {
    const quote = await this.repository.findAccessible(userId, quoteId);
    if (!quote) throw new QuoteNotFoundError();
    return quote;
  }

  async withdraw(userId: string, quoteId: string, version: number) {
    if (!(await this.repository.isActiveProfessional(userId))) throw new ProfessionalRequiredError();
    const result = await this.repository.withdraw(userId, quoteId, version);
    if (result === 'NOT_FOUND') throw new QuoteNotFoundError();
    if (result === 'ILLEGAL_TRANSITION') throw new QuoteIllegalTransitionError();
    if (result === 'VERSION_CONFLICT') throw new QuoteVersionConflictError();
    return result;
  }

  async counter(userId: string, quoteId: string, idempotencyKey: string | undefined, dto: CounterOfferDto) {
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new QuoteInvalidError('idempotency_key_required');
    const normalized = { quote_id: quoteId, price: dto.price, duration_days: dto.duration_days ?? null,
      message: dto.message?.trim() || null, version: dto.version };
    const command: CounterOfferCommand = { price: normalized.price, durationDays: normalized.duration_days,
      message: normalized.message, version: normalized.version, idempotencyKey,
      requestHash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex') };
    const result = await this.repository.counter(userId, quoteId, command);
    if (result === 'NOT_FOUND') throw new QuoteNotFoundError();
    if (result === 'ILLEGAL_TRANSITION') throw new QuoteIllegalTransitionError();
    if (result === 'VERSION_CONFLICT') throw new QuoteVersionConflictError();
    if (result === 'SAME_ACTOR') throw new QuoteSameActorError();
    if (result === 'LIMIT_REACHED') throw new QuoteNegotiationLimitError();
    if (result === 'IDEMPOTENCY_MISMATCH') throw new QuoteIdempotencyMismatchError();
    return result;
  }

  async history(userId: string, quoteId: string) {
    const rows = await this.repository.history(userId, quoteId);
    if (rows === 'NOT_FOUND') throw new QuoteNotFoundError();
    return { items: rows };
  }

  async accept(userId: string, quoteId: string, idempotencyKey: string | undefined, dto: AcceptQuoteDto) {
    if (!(await this.repository.isActiveClient(userId))) throw new RequestForbiddenError();
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new QuoteInvalidError('idempotency_key_required');
    const normalized = { quote_id: quoteId, version: dto.version, request_version: dto.request_version };
    const command: AcceptQuoteCommand = { quoteVersion: dto.version, requestVersion: dto.request_version,
      idempotencyKey, requestHash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex') };
    const result = await this.repository.accept(userId, quoteId, command);
    if (result === 'NOT_FOUND') throw new QuoteNotFoundError();
    if (result === 'ILLEGAL_TRANSITION') throw new QuoteAcceptanceConflictError();
    if (result === 'VERSION_CONFLICT') throw new QuoteVersionConflictError();
    if (result === 'IDEMPOTENCY_MISMATCH') throw new QuoteIdempotencyMismatchError();
    return result;
  }

  private page(rows: QuoteDetailView[], limit: number) {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return { items, next_cursor: hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString('base64url') : null };
  }

  private decodeCursor(value: string): { createdAt: string; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as Record<string, unknown>;
      if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt)) ||
          typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.id)) throw new Error();
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch { throw new QuoteInvalidError('invalid_cursor'); }
  }
}
