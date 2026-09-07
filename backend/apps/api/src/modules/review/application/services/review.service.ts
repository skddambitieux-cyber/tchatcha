import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ReviewRepositoryPortToken } from '../ports/review-repository.port';
import type { ReviewRepositoryPort } from '../ports/review-repository.port';
import type { CreateReviewDto } from '../../interface/http/dto/review.dto';
import { ReviewAlreadyExistsError, ReviewBookingNotFoundError, ReviewForbiddenError, ReviewIdempotencyKeyError, ReviewIdempotencyMismatchError, ReviewInvalidStateError, ReviewMediaInvalidError, ReviewNotFoundError } from '../../domain/errors/review-errors';

@Injectable()
export class ReviewService {
  constructor(@Inject(ReviewRepositoryPortToken) private readonly repository: ReviewRepositoryPort) {}

  async create(actorId: string, key: string | undefined, dto: CreateReviewDto) {
    if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new ReviewIdempotencyKeyError();
    const normalized: CreateReviewDto = { ...dto, comment: dto.comment?.trim() || undefined, media_ids: [...(dto.media_ids ?? [])].sort() };
    const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const result = await this.repository.create({ actorId, idempotencyKey: key, requestHash: hash, dto: normalized });
    if (result === 'NOT_FOUND') throw new ReviewBookingNotFoundError();
    if (result === 'FORBIDDEN') throw new ReviewForbiddenError();
    if (result === 'INVALID_STATE') throw new ReviewInvalidStateError();
    if (result === 'ALREADY_EXISTS') throw new ReviewAlreadyExistsError();
    if (result === 'IDEMPOTENCY_MISMATCH') throw new ReviewIdempotencyMismatchError();
    if (result === 'MEDIA_INVALID') throw new ReviewMediaInvalidError();
    return result;
  }

  async list(professionalId: string, limit = 20, cursor?: string) {
    const result = await this.repository.list(professionalId, Math.min(Math.max(limit, 1), 100), cursor);
    if (!result) throw new ReviewNotFoundError();
    return result;
  }
}
