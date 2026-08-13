export interface BookingView {
  id: string;
  request_id: string;
  quote_id: string;
  slot_id: string;
  professional: { id: string; business_name: string | null };
  scheduled_start: string;
  scheduled_end: string;
  status: string;
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
}
export const BookingRepositoryPortToken = Symbol('BookingRepositoryPort');
