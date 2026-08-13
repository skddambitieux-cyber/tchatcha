/**
 * TCHATCHA — Port repository pay (FCT-013). Source de vérité : pay.transactions
 * (une ligne = une tentative) + pay.provider_operations (une ligne par tentative
 * fournisseur) + pay.webhook_events (idempotence webhook — uq_webhook_events).
 */
export interface PaymentView {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  booking_id: string;
  payer_phone: string;
  country_code: string;
  version: number;
  created_at: string;
}

export interface CreatePaymentCommand {
  bookingId: string;
  idempotencyKey: string;
  requestHash: string;
}

export type CreatePaymentResult =
  | PaymentView
  | 'NOT_FOUND'
  | 'ILLEGAL_TRANSITION'
  | 'ALREADY_SUCCEEDED'
  | 'IDEMPOTENCY_MISMATCH';

export type AuthorizeResult =
  | 'AUTHORIZED'
  | 'ALREADY_SUCCEEDED'
  | 'FAILED'
  | 'NOT_FOUND';

export type ConfirmResult =
  | 'CONFIRMED'
  | 'ALREADY_SUCCEEDED'
  | 'FAILED'
  | 'NOT_FOUND'
  | 'REQUEST_ILLEGAL_TRANSITION';

export type MarkFailedResult = 'FAILED' | 'NOT_FOUND' | 'NOOP';

export interface WebhookRecordInput {
  providerCode: string;
  externalRef: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface PayRepositoryPort {
  isActiveClient(userId: string): Promise<boolean>;
  /** Valide booking/quote/request puis crée la transaction PENDING (FCT-013). */
  createPayment(
    userId: string,
    command: CreatePaymentCommand,
  ): Promise<CreatePaymentResult>;
  bindOperation(
    transactionId: string,
    providerCode: string,
    externalRef: string,
  ): Promise<void>;
  findById(userId: string, paymentId: string): Promise<PaymentView | null>;
  /** PENDING → AUTHORIZED (autorisation OTP utilisateur, demande reste SELECTED). */
  authorize(paymentId: string): Promise<AuthorizeResult>;
  /**
   * SUCCEEDED + atomique SELECTED → PAID (même transaction SQL).
   * Ligne verrouillée par l'UPDATE conditionnel : les confirmations
   * concurrentes sérialisent et une seule gagne.
   */
  confirm(paymentId: string): Promise<ConfirmResult>;
  /** PENDING/AUTHORIZED → FAILED (terminal pour cette tentative). */
  markFailed(paymentId: string): Promise<MarkFailedResult>;
  resolveTransaction(
    providerCode: string,
    externalRef: string,
  ): Promise<{ id: string } | null>;
  /** INSERT dédupliqué (uq_webhook_events : provider_code, external_ref, event_type). */
  recordWebhook(input: WebhookRecordInput): Promise<'INSERTED' | 'DUPLICATE'>;
  markWebhookProcessed(
    providerCode: string,
    externalRef: string,
    eventType: string,
    error: string | null,
  ): Promise<void>;
}
export const PayRepositoryPortToken = Symbol('PayRepositoryPort');