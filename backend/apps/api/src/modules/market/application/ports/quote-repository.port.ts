export interface CreateQuoteCommand {
  requestId: string;
  price: number;
  durationDays: number | null;
  message: string | null;
  idempotencyKey: string;
  requestHash: string;
}

export interface QuoteView {
  id: string;
  request_id: string;
  professional_id: string;
  price: number;
  currency: string;
  duration_days: number | null;
  message: string | null;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export type CreateQuoteResult = QuoteView | 'NOT_MATCHED' | 'ACTIVE_QUOTE_EXISTS' | 'IDEMPOTENCY_MISMATCH';

export interface QuoteRepositoryPort {
  isPublishableProfessional(userId: string): Promise<boolean>;
  create(userId: string, command: CreateQuoteCommand): Promise<CreateQuoteResult>;
}

export const QuoteRepositoryPortToken = Symbol('QuoteRepositoryPort');
