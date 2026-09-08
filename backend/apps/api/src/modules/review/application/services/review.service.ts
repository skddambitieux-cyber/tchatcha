import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ReviewRepositoryPortToken } from '../ports/review-repository.port';
import type { ReviewRepositoryPort } from '../ports/review-repository.port';
import type { CreateReviewDto, RespondReviewDto, UpdateReviewDto } from '../../interface/http/dto/review.dto';
import { ReviewAlreadyEditedError, ReviewAlreadyExistsError, ReviewBookingNotFoundError, ReviewEditWindowClosedError, ReviewForbiddenError, ReviewIdempotencyKeyError, ReviewIdempotencyMismatchError, ReviewInvalidStateError, ReviewMediaInvalidError, ReviewNotEditableError, ReviewNotFoundError, ReviewResponseExistsError } from '../../domain/errors/review-errors';

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

  async update(actorId: string, reviewId: string, dto: UpdateReviewDto) {
    const normalized = { ...dto, comment: dto.comment?.trim() || undefined, media_ids: [...(dto.media_ids ?? [])].sort() };
    const result = await this.repository.update({ actorId, reviewId, dto: normalized });
    if (result === 'NOT_FOUND') throw new ReviewNotFoundError();
    if (result === 'FORBIDDEN') throw new ReviewForbiddenError();
    if (result === 'WINDOW_CLOSED') throw new ReviewEditWindowClosedError();
    if (result === 'ALREADY_EDITED') throw new ReviewAlreadyEditedError();
    if (result === 'INVALID_STATE') throw new ReviewNotEditableError();
    if (result === 'MEDIA_INVALID') throw new ReviewMediaInvalidError();
    return result;
  }

  async respond(actorId: string, reviewId: string, key: string | undefined, dto: RespondReviewDto) {
    if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new ReviewIdempotencyKeyError();
    const body = dto.body.trim();
    const hash = createHash('sha256').update(JSON.stringify({ body })).digest('hex');
    const result = await this.repository.respond({ actorId, reviewId, idempotencyKey: key, requestHash: hash, body });
    if (result === 'NOT_FOUND') throw new ReviewNotFoundError();
    if (result === 'FORBIDDEN') throw new ReviewForbiddenError();
    if (result === 'INVALID_STATE') throw new ReviewNotEditableError();
    if (result === 'ALREADY_EXISTS') throw new ReviewResponseExistsError();
    if (result === 'IDEMPOTENCY_MISMATCH') throw new ReviewIdempotencyMismatchError();
    return result;
  }
}
