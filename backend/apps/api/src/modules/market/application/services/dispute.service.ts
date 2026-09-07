import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DisputeRepositoryPortToken } from '../ports/dispute-repository.port';
import type { DisputeRepositoryPort } from '../ports/dispute-repository.port';
import { DisputeAlreadyOpenError, DisputeCompletionInProgressError, DisputeForbiddenError, DisputeIdempotencyMismatchError, DisputeInvalidStateError, DisputeMediaInvalidError, DisputeNotFoundError } from '../../domain/errors/dispute-errors';
import type { CreateDisputeDto } from '../../interface/http/dto/dispute.dto';

@Injectable()
export class DisputeService {
  constructor(@Inject(DisputeRepositoryPortToken) private readonly repository: DisputeRepositoryPort) {}

  async open(actorId: string, key: string | undefined, dto: CreateDisputeDto) {
    if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new DisputeInvalidStateError();
    const normalized = { booking_id: dto.booking_id, reason: dto.reason,
      description: dto.description.trim(), media_ids: [...(dto.media_ids ?? [])].sort() };
    const result = await this.repository.open({ actorId, idempotencyKey: key,
      requestHash: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'), dto: normalized });
    if (result === 'NOT_FOUND') throw new DisputeNotFoundError();
    if (result === 'FORBIDDEN') throw new DisputeForbiddenError();
    if (result === 'INVALID_STATE') throw new DisputeInvalidStateError();
    if (result === 'ALREADY_OPEN') throw new DisputeAlreadyOpenError();
    if (result === 'IDEMPOTENCY_MISMATCH') throw new DisputeIdempotencyMismatchError();
    if (result === 'COMPLETION_IN_PROGRESS') throw new DisputeCompletionInProgressError();
    if (result === 'MEDIA_INVALID') throw new DisputeMediaInvalidError();
    return result;
  }

  async get(actorId: string, id: string) {
    const result = await this.repository.findVisible(id, actorId);
    if (result === null || result === 'FORBIDDEN') throw new DisputeNotFoundError();
    return result;
  }
}
