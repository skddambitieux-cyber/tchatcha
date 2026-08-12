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
