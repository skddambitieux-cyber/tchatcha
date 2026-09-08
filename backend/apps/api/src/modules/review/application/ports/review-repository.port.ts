import type { CreateReviewDto, ModerateReviewDto, ReportReviewDto, ReviewListView, ReviewResponseView, ReviewView, UpdateReviewDto } from '../../interface/http/dto/review.dto';

export type CreateReviewResult = ReviewView | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE' | 'ALREADY_EXISTS' | 'IDEMPOTENCY_MISMATCH' | 'MEDIA_INVALID';
export interface CreateReviewCommand { actorId: string; idempotencyKey: string; requestHash: string; dto: CreateReviewDto; }
export type UpdateReviewResult = ReviewView | 'NOT_FOUND' | 'FORBIDDEN' | 'WINDOW_CLOSED' | 'ALREADY_EDITED' | 'INVALID_STATE' | 'MEDIA_INVALID';
export interface UpdateReviewCommand { actorId: string; reviewId: string; dto: UpdateReviewDto; }
export type RespondReviewResult = ReviewResponseView | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE' | 'ALREADY_EXISTS' | 'IDEMPOTENCY_MISMATCH';
export interface RespondReviewCommand { actorId: string; reviewId: string; idempotencyKey: string; requestHash: string; body: string; }
export type ReportReviewResult = { id: string; review_id: string; status: string; created_at: string } | 'NOT_FOUND' | 'FORBIDDEN' | 'IDEMPOTENCY_MISMATCH';
export interface ReportReviewCommand { actorId: string; reviewId: string; idempotencyKey: string; requestHash: string; dto: ReportReviewDto; }
export type ModerateReviewResult = ReviewView | 'NOT_FOUND' | 'INVALID_STATE';
export interface ModerateReviewCommand { adminId: string; reviewId: string; dto: ModerateReviewDto; }
export interface ModerationQueueItem { id: string; status: string; reviewee_id: string; rating: number; comment: string | null; report_count: number; reasons: string[]; created_at: string; }
export interface ReviewRepositoryPort {
  create(command: CreateReviewCommand): Promise<CreateReviewResult>;
  update(command: UpdateReviewCommand): Promise<UpdateReviewResult>;
  respond(command: RespondReviewCommand): Promise<RespondReviewResult>;
  report(command: ReportReviewCommand): Promise<ReportReviewResult>;
  moderate(command: ModerateReviewCommand): Promise<ModerateReviewResult>;
  listModeration(status: string): Promise<ModerationQueueItem[]>;
  list(professionalId: string, limit: number, cursor?: string): Promise<ReviewListView | null>;
}
export const ReviewRepositoryPortToken = Symbol('ReviewRepositoryPort');
