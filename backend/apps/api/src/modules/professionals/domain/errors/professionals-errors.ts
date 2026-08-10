/**
 * TCHATCHA — Erreurs métier du module professionals (lot 6.3.3, 6.3.4).
 * Même forme (code + httpStatus) que les erreurs auth — mappées par
 * AuthExceptionsFilter (APP_FILTER global, shape partagée).
 */

/** 404 professional_not_found — RF-PW02 (35 §2) : non-dévoilement. */
export class ProfessionalNotFoundError extends Error {
  readonly code = 'professional_not_found';
  readonly httpStatus = 404;
  constructor() {
    super('Vitrine professionnelle introuvable');
    this.name = 'ProfessionalNotFoundError';
  }
}

/** 404 service_not_found — 36 §3 : id de service inconnu du pro. */
export class ServiceNotFoundError extends Error {
  readonly code = 'service_not_found';
  readonly httpStatus = 404;
  constructor() {
    super('Service introuvable');
    this.name = 'ServiceNotFoundError';
  }
}

/** 404 category_not_found — 36 RF-PW-W07 : category_id inconnue. */
export class CategoryNotFoundError extends Error {
  readonly code = 'category_not_found';
  readonly httpStatus = 404;
  constructor() {
    super('Catégorie introuvable');
    this.name = 'CategoryNotFoundError';
  }
}

/** 422 category_not_assignable — 36 RF-PW-W07 : non-feuille ou inactive (CAT-001/002). */
export class CategoryNotAssignableError extends Error {
  readonly code = 'category_not_assignable';
  readonly httpStatus = 422;
  constructor() {
    super('Catégorie non assignable (non-feuille ou inactive)');
    this.name = 'CategoryNotAssignableError';
  }
}

/** 404 division_not_found — 36 RF-PW-W09 : division_id inconnu dans geo.divisions. */
export class DivisionNotFoundError extends Error {
  readonly code = 'division_not_found';
  readonly httpStatus = 404;
  constructor() {
    super('Division géographique introuvable');
    this.name = 'DivisionNotFoundError';
  }
}

/** 422 business_hours_invalid — 36 RF-PW-W08 : weekday doublon/hors 1-7, close ≤ open. */
export class BusinessHoursInvalidError extends Error {
  readonly code = 'business_hours_invalid';
  readonly httpStatus = 422;
  constructor() {
    super('Jeu d\'horaires invalide (weekday unique 1-7, close > open)');
    this.name = 'BusinessHoursInvalidError';
  }
}

/** 422 service_invalid — 36 RF-PW-W05 : prix incohérents (price_to < price_from). */
export class ServiceInvalidError extends Error {
  readonly code = 'service_invalid';
  readonly httpStatus = 422;
  constructor() {
    super('Service invalide (price_to >= price_from requis)');
    this.name = 'ServiceInvalidError';
  }
}

/** 422 verification_type_not_supported — 38 RF-VR-02 : type de document inconnu. */
export class VerificationTypeNotSupportedError extends Error {
  readonly code = 'verification_type_not_supported';
  readonly httpStatus = 422;
  constructor() {
    super('Type de document de vérification non supporté');
    this.name = 'VerificationTypeNotSupportedError';
  }
}

/** 422 document_already_used — 38 RF-VR-03 : média déjà référencé par une ligne. */
export class DocumentAlreadyUsedError extends Error {
  readonly code = 'document_already_used';
  readonly httpStatus = 422;
  constructor() {
    super('Document déjà utilisé par une ligne de vérification');
    this.name = 'DocumentAlreadyUsedError';
  }
}

/** 409 verification_pending — 38 RF-VR-04 : ligne PENDING en attente de décision. */
export class VerificationPendingError extends Error {
  readonly code = 'verification_pending';
  readonly httpStatus = 409;
  constructor() {
    super('Une demande de vérification est déjà en attente');
    this.name = 'VerificationPendingError';
  }
}

/** 409 verification_already_approved — 38 RF-VR-04 : document déjà approuvé. */
export class VerificationAlreadyApprovedError extends Error {
  readonly code = 'verification_already_approved';
  readonly httpStatus = 409;
  constructor() {
    super('Document de vérification déjà approuvé');
    this.name = 'VerificationAlreadyApprovedError';
  }
}