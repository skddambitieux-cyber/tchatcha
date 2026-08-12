import { Inject, Injectable } from '@nestjs/common';
import { MatchedRequestRepositoryPortToken } from '../ports/matched-request-repository.port';
import type { MatchedRequestRepositoryPort } from '../ports/matched-request-repository.port';
import { ProfessionalRequiredError, RequestInvalidError, RequestNotFoundError } from '../../domain/errors/request-errors';

@Injectable()
export class MatchedRequestService {
  constructor(@Inject(MatchedRequestRepositoryPortToken) private readonly repository: MatchedRequestRepositoryPort) {}

  async list(userId: string, limit: number, cursorValue?: string) {
    await this.assertProfessional(userId);
    const cursor = cursorValue ? this.decodeCursor(cursorValue) : undefined;
    const rows = await this.repository.listMatched(userId, limit + 1, cursor);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      next_cursor: hasMore && last
        ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString('base64url')
        : null,
    };
  }

  async detail(userId: string, requestId: string) {
    await this.assertProfessional(userId);
    const request = await this.repository.findMatched(userId, requestId);
    if (!request) throw new RequestNotFoundError();
    return request;
  }

  private async assertProfessional(userId: string) {
    if (!(await this.repository.isPublishableProfessional(userId))) throw new ProfessionalRequiredError();
  }

  private decodeCursor(value: string): { createdAt: string; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as Record<string, unknown>;
      if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt)) ||
          typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.id)) throw new Error();
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch { throw new RequestInvalidError('invalid_cursor'); }
  }
}
