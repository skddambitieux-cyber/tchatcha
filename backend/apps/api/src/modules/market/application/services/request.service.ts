import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RequestRepositoryPortToken } from '../ports/request-repository.port';
import type { PublishRequestCommand, RequestRepositoryPort } from '../ports/request-repository.port';
import { RequestForbiddenError, RequestIdempotencyMismatchError, RequestIllegalTransitionError, RequestInvalidError, RequestNotFoundError, RequestVersionConflictError } from '../../domain/errors/request-errors';
import type { PublishRequestDto } from '../../interface/http/dto/request.dto';

@Injectable()
export class RequestService {
  constructor(@Inject(RequestRepositoryPortToken) private readonly repository: RequestRepositoryPort) {}

  async publish(userId: string, idempotencyKey: string | undefined, dto: PublishRequestDto) {
    await this.assertClient(userId);
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
      throw new RequestInvalidError('idempotency_key_required');
    }
    const location = dto.location;
    if (!location) throw new RequestInvalidError('location_required');
    const hasLat = location.lat != null;
    const hasLon = location.lon != null;
    if (hasLat !== hasLon) throw new RequestInvalidError('coordinates_required_together');
    if (!location.division_id) throw new RequestInvalidError('division_required');
    if (dto.budget_min != null && dto.budget_max != null && dto.budget_min > dto.budget_max) {
      throw new RequestInvalidError('invalid_budget');
    }
    if (dto.desired_date && new Date(dto.desired_date).getTime() <= Date.now()) {
      throw new RequestInvalidError('desired_date_in_past');
    }
    const normalized = {
      category_id: dto.category_id,
      title: dto.title.trim(),
      description: dto.description.trim(),
      division_id: location.division_id ?? null,
      lat: location.lat ?? null,
      lon: location.lon ?? null,
      budget_min: dto.budget_min ?? null,
      budget_max: dto.budget_max ?? null,
      desired_date: dto.desired_date ? new Date(dto.desired_date).toISOString() : null,
      urgency: dto.urgency,
    };
    const command: PublishRequestCommand = {
      categoryId: normalized.category_id, title: normalized.title,
      description: normalized.description, divisionId: normalized.division_id,
      lat: normalized.lat, lon: normalized.lon, budgetMin: normalized.budget_min,
      budgetMax: normalized.budget_max,
      desiredDate: normalized.desired_date ? new Date(normalized.desired_date) : null,
      urgency: normalized.urgency, idempotencyKey,
      requestHash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
    };
    const result = await this.repository.publish(userId, command);
    if (result === 'IDEMPOTENCY_MISMATCH') throw new RequestIdempotencyMismatchError();
    return result;
  }

  async listMine(userId: string, limit: number, cursorValue?: string) {
    await this.assertClient(userId);
    const cursor = cursorValue ? this.decodeCursor(cursorValue) : undefined;
    const rows = await this.repository.listMine(userId, limit + 1, cursor);
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

  async getMine(userId: string, requestId: string) {
    await this.assertClient(userId);
    const result = await this.repository.findMine(userId, requestId);
    if (!result) throw new RequestNotFoundError();
    return result;
  }

  async cancel(userId: string, requestId: string, reason: string, version: number) {
    await this.assertClient(userId);
    const result = await this.repository.cancel(userId, requestId, reason.trim(), version);
    if (result === 'NOT_FOUND') throw new RequestNotFoundError();
    if (result === 'ILLEGAL_TRANSITION') throw new RequestIllegalTransitionError();
    if (result === 'VERSION_CONFLICT') throw new RequestVersionConflictError();
    return result;
  }

  private async assertClient(userId: string) {
    if (!(await this.repository.isActiveClient(userId))) throw new RequestForbiddenError();
  }

  private decodeCursor(value: string): { createdAt: string; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as Record<string, unknown>;
      if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt)) ||
          typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.id)) {
        throw new Error();
      }
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch { throw new RequestInvalidError('invalid_cursor'); }
  }
}
