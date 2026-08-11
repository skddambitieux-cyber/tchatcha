export class ForbiddenError extends Error {
  readonly code = 'forbidden';
  readonly httpStatus = 403;
  constructor() { super('Accès interdit'); this.name = 'ForbiddenError'; }
}

export class VerificationNotFoundError extends Error {
  readonly code = 'verification_not_found';
  readonly httpStatus = 404;
  constructor() { super('Vérification introuvable'); this.name = 'VerificationNotFoundError'; }
}

export class VerificationPendingError extends Error {
  readonly code = 'verification_pending';
  readonly httpStatus = 409;
  constructor() { super('La vérification ne peut pas être décidée dans cet état'); this.name = 'VerificationPendingError'; }
}

export class MissingReasonError extends Error {
  readonly code = 'missing_reason';
  readonly httpStatus = 422;
  constructor() { super('Le motif de rejet est obligatoire'); this.name = 'MissingReasonError'; }
}
