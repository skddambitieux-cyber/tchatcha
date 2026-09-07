import type { CreateReviewDto, ReviewListView, ReviewView } from '../../interface/http/dto/review.dto';

export type CreateReviewResult = ReviewView | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE' | 'ALREADY_EXISTS' | 'IDEMPOTENCY_MISMATCH' | 'MEDIA_INVALID';
export interface CreateReviewCommand { actorId: string; idempotencyKey: string; requestHash: string; dto: CreateReviewDto; }
export interface ReviewRepositoryPort {
  create(command: CreateReviewCommand): Promise<CreateReviewResult>;
  list(professionalId: string, limit: number, cursor?: string): Promise<ReviewListView | null>;
}
export const ReviewRepositoryPortToken = Symbol('ReviewRepositoryPort');
