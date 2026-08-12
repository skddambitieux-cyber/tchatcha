class RequestError extends Error {
  constructor(message: string, readonly code: string, readonly httpStatus: number) {
    super(message);
  }
}
export class RequestNotFoundError extends RequestError {
  constructor() { super('Demande introuvable', 'request_not_found', 404); }
}
export class RequestForbiddenError extends RequestError {
  constructor() { super('Compte client actif requis', 'client_required', 403); }
}
export class ProfessionalRequiredError extends RequestError {
  constructor() { super('Profil professionnel publiable requis', 'professional_required', 403); }
}
export class QuoteInvalidError extends RequestError {
  constructor(code = 'quote_invalid') { super('Devis invalide', code, 422); }
}
export class QuoteActiveExistsError extends RequestError {
  constructor() { super('Un devis actif existe déjà pour cette demande', 'active_quote_exists', 409); }
}
export class QuoteIdempotencyMismatchError extends RequestError {
  constructor() { super('Clé réutilisée avec un contenu différent', 'idempotency_mismatch', 409); }
}
export class QuoteNotFoundError extends RequestError {
  constructor() { super('Devis introuvable', 'quote_not_found', 404); }
}
export class QuoteVersionConflictError extends RequestError {
  constructor() { super('Version du devis obsolète', 'quote_version_conflict', 409); }
}
export class QuoteIllegalTransitionError extends RequestError {
  constructor() { super('Retrait du devis interdit', 'quote_illegal_transition', 409); }
}
export class QuoteSameActorError extends RequestError {
  constructor() { super('La contre-offre doit venir de l’autre partie', 'counter_offer_same_actor', 409); }
}
export class QuoteNegotiationLimitError extends RequestError {
  constructor() { super('Limite de contre-offres atteinte', 'counter_offer_limit_reached', 409); }
}
export class RequestInvalidError extends RequestError {
  constructor(code = 'request_invalid') { super('Demande invalide', code, 422); }
}
export class RequestIdempotencyMismatchError extends RequestError {
  constructor() { super('Clé réutilisée avec un contenu différent', 'idempotency_mismatch', 409); }
}
export class RequestVersionConflictError extends RequestError {
  constructor() { super('Version obsolète', 'version_conflict', 409); }
}
export class RequestIllegalTransitionError extends RequestError {
  constructor() { super('Transition de demande interdite', 'illegal_transition', 409); }
}
