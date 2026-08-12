export interface PublishRequestCommand {
  categoryId: string; title: string; description: string;
  divisionId: string | null; lat: number | null; lon: number | null;
  budgetMin: number | null; budgetMax: number | null;
  desiredDate: Date | null; urgency: string;
  idempotencyKey: string; requestHash: string;
}
export interface RequestView {
  id: string; category_id: string; category_name: string; title: string;
  description: string; country_code: string; division_id: string | null;
  division_name: string | null; lat: number | null; lon: number | null;
  budget_min: number | null; budget_max: number | null; currency: string;
  desired_date: string | null; urgency: string; status: string;
  expires_at: string; cancel_reason: string | null; version: number;
  created_at: string; updated_at: string;
}
export interface RequestRepositoryPort {
  isActiveClient(userId: string): Promise<boolean>;
  publish(userId: string, command: PublishRequestCommand): Promise<RequestView | 'IDEMPOTENCY_MISMATCH'>;
  listMine(userId: string, limit: number, cursor?: { createdAt: string; id: string }): Promise<RequestView[]>;
  findMine(userId: string, requestId: string): Promise<RequestView | null>;
  cancel(userId: string, requestId: string, reason: string, version: number): Promise<RequestView | 'NOT_FOUND' | 'ILLEGAL_TRANSITION' | 'VERSION_CONFLICT'>;
}
export const RequestRepositoryPortToken = Symbol('RequestRepositoryPort');
