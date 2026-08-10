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