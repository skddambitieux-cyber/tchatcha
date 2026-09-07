class DisputeError extends Error {
  constructor(message: string, readonly code: string, readonly httpStatus: number) { super(message); }
}
export class DisputeNotFoundError extends DisputeError { constructor() { super('Litige introuvable', 'dispute_not_found', 404); } }
export class DisputeForbiddenError extends DisputeError { constructor() { super('Accès au litige interdit', 'forbidden', 403); } }
export class DisputeInvalidStateError extends DisputeError { constructor() { super('La réservation ne peut pas faire l’objet d’un litige dans cet état', 'booking_dispute_invalid_state', 409); } }
export class DisputeAlreadyOpenError extends DisputeError { constructor() { super('Un litige est déjà ouvert pour cette réservation', 'dispute_already_open', 409); } }
export class DisputeIdempotencyMismatchError extends DisputeError { constructor() { super('Clé réutilisée avec un contenu différent', 'idempotency_mismatch', 409); } }
export class DisputeCompletionInProgressError extends DisputeError { constructor() { super('La finalisation financière est en cours', 'completion_in_progress', 409); } }
export class DisputeMediaInvalidError extends DisputeError { constructor() { super('Une preuve média est invalide ou non autorisée', 'media_invalid', 422); } }
