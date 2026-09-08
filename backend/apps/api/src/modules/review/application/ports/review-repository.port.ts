import type { CreateReviewDto, ReviewListView, ReviewResponseView, ReviewView, UpdateReviewDto } from '../../interface/http/dto/review.dto';

export type CreateReviewResult = ReviewView | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE' | 'ALREADY_EXISTS' | 'IDEMPOTENCY_MISMATCH' | 'MEDIA_INVALID';
export interface CreateReviewCommand { actorId: string; idempotencyKey: string; requestHash: string; dto: CreateReviewDto; }
export type UpdateReviewResult = ReviewView | 'NOT_FOUND' | 'FORBIDDEN' | 'WINDOW_CLOSED' | 'ALREADY_EDITED' | 'INVALID_STATE' | 'MEDIA_INVALID';
export interface UpdateReviewCommand { actorId: string; reviewId: string; dto: UpdateReviewDto; }
export type RespondReviewResult = ReviewResponseView | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE' | 'ALREADY_EXISTS' | 'IDEMPOTENCY_MISMATCH';
export interface RespondReviewCommand { actorId: string; reviewId: string; idempotencyKey: string; requestHash: string; body: string; }
export interface ReviewRepositoryPort {
  create(command: CreateReviewCommand): Promise<CreateReviewResult>;
  update(command: UpdateReviewCommand): Promise<UpdateReviewResult>;
  respond(command: RespondReviewCommand): Promise<RespondReviewResult>;
  list(professionalId: string, limit: number, cursor?: string): Promise<ReviewListView | null>;
}
export const ReviewRepositoryPortToken = Symbol('ReviewRepositoryPort');
