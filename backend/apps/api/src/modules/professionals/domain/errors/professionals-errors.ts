/**
 * TCHATCHA — Erreurs métier du module professionals (lot 6.3.3).
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