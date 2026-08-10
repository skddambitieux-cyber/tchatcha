/**
 * TCHATCHA — Erreurs métier du module media (lot 6.3.5a, 37 §3).
 * Même forme (code + httpStatus) que les erreurs auth/professionals —
 * mappées par AuthExceptionsFilter (APP_FILTER global, shape partagée).
 */

/** 404 professional_not_found — 37 RF-PW-P07 : non-PRO ou fiche absente (RF-PW02). */
export class ProfessionalNotFoundError extends Error {
  readonly code = 'professional_not_found';
  readonly httpStatus = 404;
  constructor() {
    super('Vitrine professionnelle introuvable');
    this.name = 'ProfessionalNotFoundError';
  }
}

/** 404 media_not_found — 37 RF-PW-P05 : inconnu ou d'un autre pro (non-dévoilement). */
export class MediaNotFoundError extends Error {
  readonly code = 'media_not_found';
  readonly httpStatus = 404;
  constructor() {
    super('Média introuvable');
    this.name = 'MediaNotFoundError';
  }
}

/** 410 media_not_uploaded — 37 RF-MD-06 : objet absent du bucket au confirm. */
export class MediaNotUploadedError extends Error {
  readonly code = 'media_not_uploaded';
  readonly httpStatus = 410;
  constructor() {
    super('Fichier non téléversé (URL présignée expirée ou PUT non effectué)');
    this.name = 'MediaNotUploadedError';
  }
}

/** 422 media_type_not_supported — 37 RF-MD-02 : MIME hors whitelist. */
export class MediaTypeNotSupportedError extends Error {
  readonly code = 'media_type_not_supported';
  readonly httpStatus = 422;
  constructor() {
    super('Type de fichier non supporté');
    this.name = 'MediaTypeNotSupportedError';
  }
}

/** 422 media_size_exceeded — 37 RF-MD-03 : > 20 Mo image / 100 Mo vidéo. */
export class MediaSizeExceededError extends Error {
  readonly code = 'media_size_exceeded';
  readonly httpStatus = 422;
  constructor() {
    super('Taille maximale dépassée (20 Mo image, 100 Mo vidéo)');
    this.name = 'MediaSizeExceededError';
  }
}

/** 422 media_purpose_not_supported — 37 RF-MD-01 : purpose hors whitelist 6.3.5a. */
export class MediaPurposeNotSupportedError extends Error {
  readonly code = 'media_purpose_not_supported';
  readonly httpStatus = 422;
  constructor() {
    super('Usage de média non supporté');
    this.name = 'MediaPurposeNotSupportedError';
  }
}

/** 422 media_limit_exceeded — 37 RF-MD-08 : > 50 lignes PROCESSING en attente. */
export class MediaLimitExceededError extends Error {
  readonly code = 'media_limit_exceeded';
  readonly httpStatus = 422;
  constructor() {
    super('Trop de médias en attente de confirmation');
    this.name = 'MediaLimitExceededError';
  }
}

/** 422 media_invalid — 37 RF-MD-06 : taille réelle > max (ligne passée FAILED). */
export class MediaInvalidError extends Error {
  readonly code = 'media_invalid';
  readonly httpStatus = 422;
  constructor() {
    super('Média invalide (taille réelle au-delà de la limite)');
    this.name = 'MediaInvalidError';
  }
}

/** 422 portfolio_update_invalid — 37 RF-PW-P02 : purpose/sort_order invalides. */
export class PortfolioUpdateInvalidError extends Error {
  readonly code = 'portfolio_update_invalid';
  readonly httpStatus = 422;
  constructor() {
    super('Mise à jour de portfolio invalide');
    this.name = 'PortfolioUpdateInvalidError';
  }
}
