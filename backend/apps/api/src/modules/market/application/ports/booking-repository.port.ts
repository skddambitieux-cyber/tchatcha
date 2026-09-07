export interface BookingView {
  id: string;
  request_id: string;
  quote_id: string;
  slot_id: string;
  professional: { id: string; business_name: string | null };
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  client_confirmed_at: string | null;
  pro_confirmed_at: string | null;
  price: number;
  currency: string;
  version: number;
}
export interface CreateBookingCommand {
  quoteId: string;
  slotId: string;
  slotVersion: number;
  quoteVersion: number;
  requestVersion: number;
  idempotencyKey: string;
  requestHash: string;
}
export type CreateBookingResult =
  | BookingView
  | 'NOT_FOUND'
  | 'ILLEGAL_TRANSITION'
  | 'VERSION_CONFLICT'
  | 'SLOT_CONFLICT'
  | 'IDEMPOTENCY_MISMATCH';

/**
 * FCT-014 (39-cadrage-market-fct-014.md) — double confirmation.
 * Deux transactions courtes, le PaymentGatewayPort est appelé par la couche
 * application ENTRE les deux (frontière architecturale nette, bug.md).
 */
export interface ReleaseIntent {
  bookingId: string;
  transactionId: string;
  /** Identité d'idempotence stable de la libération (bug.md FCT-014) : dérivée
   *  du paiement, réutilisée telle quelle sur tous les retries. */
  idempotencyKey: string;
  /** Net à libérer (brut − commission, calcul SQL exact). */
  amount: number;
  currency: string;
  countryCode: string;
  beneficiaryPhone: string | null;
  commissionRate: number;
  commissionAmount: number;
}
export type ReleaseOutcome = {
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  providerCode: string;
  externalRef?: string;
  failureReason?: string;
};
export type ConfirmProgressResult =
  | { kind: 'FIRST_CONFIRMED'; view: BookingView }
  | { kind: 'SECOND_CONFIRMED'; view: BookingView; release: ReleaseIntent }
  | { kind: 'RESUME_RELEASE'; view: BookingView; release: ReleaseIntent }
  | { kind: 'ALREADY_CONFIRMED'; view: BookingView }
  | { kind: 'ALREADY_COMPLETED'; view: BookingView }
  | { kind: 'NOT_FOUND' }
  | { kind: 'FORBIDDEN' }
  | { kind: 'ILLEGAL_STATE'; view: BookingView };
export type FinalizeResult =
  | { kind: 'COMPLETED'; view: BookingView }
  | { kind: 'ALREADY_COMPLETED'; view: BookingView }
  | { kind: 'RELEASE_FAILED'; view: BookingView }
  | { kind: 'BOOKING_DISPUTED'; view: BookingView };
export interface BookingRepositoryPort {
  isActiveClient(userId: string): Promise<boolean>;
  listSlots(
    professionalId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{ id: string; start: string; end: string; version: number }>
  >;
  create(
    userId: string,
    command: CreateBookingCommand,
  ): Promise<CreateBookingResult>;
  /** Phase A : verrou, horodatage du rôle, décision (aucun appel fournisseur). */
  confirm(bookingId: string, userId: string): Promise<ConfirmProgressResult>;
  /** Phase B : écrit l'issue de la release + COMPLETED (re-verrouille). */
  finalize(
    bookingId: string,
    intent: ReleaseIntent,
    outcome: ReleaseOutcome,
  ): Promise<FinalizeResult>;
}
export const BookingRepositoryPortToken = Symbol('BookingRepositoryPort');
