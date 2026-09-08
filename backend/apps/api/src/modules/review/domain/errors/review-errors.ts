class ReviewError extends Error {
  constructor(message: string, readonly code: string, readonly httpStatus: number) { super(message); }
}
export class ReviewNotFoundError extends ReviewError { constructor() { super('Avis introuvable', 'professional_not_found', 404); } }
export class ReviewForbiddenError extends ReviewError { constructor() { super('Création d’avis interdite', 'forbidden', 403); } }
export class ReviewBookingNotFoundError extends ReviewError { constructor() { super('Réservation introuvable', 'booking_not_found', 404); } }
export class ReviewInvalidStateError extends ReviewError { constructor() { super('La réservation ne peut pas recevoir un avis dans cet état', 'review_booking_invalid_state', 409); } }
export class ReviewAlreadyExistsError extends ReviewError { constructor() { super('Un avis existe déjà pour cette réservation', 'review_already_exists', 409); } }
export class ReviewIdempotencyMismatchError extends ReviewError { constructor() { super('Clé réutilisée avec un contenu différent', 'idempotency_mismatch', 409); } }
export class ReviewMediaInvalidError extends ReviewError { constructor() { super('Un média est invalide ou non autorisé', 'review_media_not_found', 404); } }
export class ReviewIdempotencyKeyError extends ReviewError { constructor() { super('Clé d’idempotence absente ou invalide', 'idempotency_key_invalid', 400); } }
export class ReviewEditWindowClosedError extends ReviewError { constructor() { super('La fenêtre de modification est fermée', 'review_edit_window_closed', 409); } }
export class ReviewAlreadyEditedError extends ReviewError { constructor() { super('Cet avis a déjà été modifié', 'review_already_edited', 409); } }
export class ReviewNotEditableError extends ReviewError { constructor() { super('Cet avis ne peut pas être modifié', 'review_not_editable', 409); } }
export class ReviewResponseExistsError extends ReviewError { constructor() { super('Cet avis possède déjà une réponse', 'review_response_exists', 409); } }
export class ReviewReportForbiddenError extends ReviewError { constructor() { super('Signalement interdit', 'forbidden', 403); } }
export class ReviewReportExistsError extends ReviewError { constructor() { super('Avis déjà signalé par cet utilisateur', 'review_report_exists', 409); } }
export class ReviewModerationConflictError extends ReviewError { constructor() { super('Conflit de modération', 'moderation_conflict', 409); } }
export class ReviewMissingReasonError extends ReviewError { constructor() { super('Le motif est obligatoire', 'missing_reason', 422); } }
