/**
 * TCHATCHA — Erreurs métier du module pay (FCT-013).
 * Shape identique à request-errors.ts : {code, httpStatus} mappés par le
 * filtre global AuthExceptionsFilter (enveloppe §5 du blueprint 12).
 */
class PayError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}
export class PaymentInvalidError extends PayError {
  constructor(code = 'payment_invalid') { super('Paiement invalide', code, 422); }
}
export class PaymentNotFoundError extends PayError {
  constructor() { super('Paiement introuvable', 'payment_not_found', 404); }
}
export class PaymentForbiddenError extends PayError {
  constructor() { super('Compte client actif requis', 'client_required', 403); }
}
export class PaymentIllegalTransitionError extends PayError {
  constructor() { super('Transition de paiement interdite', 'payment_illegal_transition', 409); }
}
export class PaymentIdempotencyMismatchError extends PayError {
  constructor() { super('Clé réutilisée avec un contenu différent', 'idempotency_mismatch', 409); }
}
export class PaymentAlreadySucceededError extends PayError {
  constructor() { super('Ce paiement a déjà été confirmé', 'payment_already_succeeded', 409); }
}
export class PaymentFailedError extends PayError {
  constructor() { super('La tentative de paiement a échoué, relancez avec une nouvelle clé', 'payment_failed', 409); }
}
export class PaymentGatewayError extends PayError {
  constructor() { super('Fournisseur de paiement indisponible', 'provider_unavailable', 503); }
}
export class WebhookSignatureInvalidError extends PayError {
  constructor() { super('Signature webhook invalide', 'webhook_signature_invalid', 401); }
}
export class WebhookInvalidError extends PayError {
  constructor(code = 'webhook_invalid') { super('Webhook invalide', code, 400); }
}
export class WebhookUnknownEventError extends PayError {
  constructor() { super('Événement webhook inconnu', 'webhook_unknown_event', 422); }
}