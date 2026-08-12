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

export interface QuoteDetailView extends QuoteView {
  out_of_budget: boolean;
  request: { id: string; title: string; urgency: string; expires_at: string };
  professional: {
    id: string; business_name: string | null; headline: string | null;
    verified: boolean; rating_avg: number; rating_count: number;
  };
}

export type CreateQuoteResult = QuoteView | 'NOT_MATCHED' | 'ACTIVE_QUOTE_EXISTS' | 'IDEMPOTENCY_MISMATCH';
export type WithdrawQuoteResult = QuoteDetailView | 'NOT_FOUND' | 'ILLEGAL_TRANSITION' | 'VERSION_CONFLICT';

export interface QuoteRepositoryPort {
  isPublishableProfessional(userId: string): Promise<boolean>;
  isActiveProfessional(userId: string): Promise<boolean>;
  isActiveClient(userId: string): Promise<boolean>;
  create(userId: string, command: CreateQuoteCommand): Promise<CreateQuoteResult>;
  listReceived(userId: string, requestId: string, limit: number, cursor?: { createdAt: string; id: string }): Promise<QuoteDetailView[] | 'NOT_FOUND'>;
  listSent(userId: string, limit: number, cursor?: { createdAt: string; id: string }): Promise<QuoteDetailView[]>;
  findAccessible(userId: string, quoteId: string): Promise<QuoteDetailView | null>;
  withdraw(userId: string, quoteId: string, version: number): Promise<WithdrawQuoteResult>;
}

export const QuoteRepositoryPortToken = Symbol('QuoteRepositoryPort');
