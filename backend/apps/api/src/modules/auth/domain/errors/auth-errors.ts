/**
 * TCHATCHA — Erreurs métier du module auth (lot 6.2).
 * Chaque erreur porte un `code` machine (contrat 27-api-contracts-auth.md §9)
 * et un statut HTTP. Mapping exact : docs/27-api-contracts-auth.md.
 */
export class PhoneInvalidError extends Error {
  readonly code = 'validation_failed';
  readonly httpStatus = 422;
  constructor() {
    super('Téléphone invalide');
    this.name = 'PhoneInvalidError';
  }
}

export class OtpCooldownError extends Error {
  readonly code = 'otp_cooldown';
  readonly httpStatus = 429;
  constructor(public readonly retryAfterSeconds: number) {
    super('Cooldown OTP non écoulé');
    this.name = 'OtpCooldownError';
  }
}

export class PhoneLockedError extends Error {
  readonly code = 'phone_locked';
  readonly httpStatus = 423;
  constructor(public readonly retryAfterSeconds: number) {
    super('Canal téléphone verrouillé');
    this.name = 'PhoneLockedError';
  }
}

export class PhoneAlreadyRegisteredError extends Error {
  readonly code = 'phone_already_registered';
  readonly httpStatus = 409;
  constructor() {
    super('Numéro déjà enregistré');
    this.name = 'PhoneAlreadyRegisteredError';
  }
}

export class NoPendingOtpError extends Error {
  readonly code = 'phone_not_found';
  readonly httpStatus = 404;
  constructor() {
    super('Aucun OTP en attente');
    this.name = 'NoPendingOtpError';
  }
}

export class OtpInvalidError extends Error {
  readonly code = 'otp_invalid';
  readonly httpStatus = 401;
  constructor(public readonly attemptsLeft: number) {
    super('Code OTP invalide');
    this.name = 'OtpInvalidError';
  }
}

export class OtpExhaustedError extends Error {
  readonly code = 'otp_exhausted';
  readonly httpStatus = 423;
  constructor() {
    super('Essais OTP épuisés');
    this.name = 'OtpExhaustedError';
  }
}

export class OtpExpiredError extends Error {
  readonly code = 'otp_expired';
  readonly httpStatus = 410;
  constructor() {
    super('Code OTP expiré');
    this.name = 'OtpExpiredError';
  }
}

export class OtpAlreadyUsedError extends Error {
  readonly code = 'otp_already_used';
  readonly httpStatus = 409;
  constructor() {
    super('Code OTP déjà utilisé');
    this.name = 'OtpAlreadyUsedError';
  }
}

export class AccountLockedError extends Error {
  readonly code = 'account_locked';
  readonly httpStatus = 403;
  constructor() {
    super('Compte suspendu ou banni');
    this.name = 'AccountLockedError';
  }
}

export class OtpNotVerifiedError extends Error {
  readonly code = 'otp_not_verified';
  readonly httpStatus = 403;
  constructor() {
    super('OTP non vérifié');
    this.name = 'OtpNotVerifiedError';
  }
}

export class ConsentRequiredError extends Error {
  readonly code = 'consent_required';
  readonly httpStatus = 422;
  constructor() {
    super('Consentement requis');
    this.name = 'ConsentRequiredError';
  }
}

export class PhoneAlreadyActiveError extends Error {
  readonly code = 'phone_already_registered';
  readonly httpStatus = 409;
  constructor() {
    super('Numéro déjà actif');
    this.name = 'PhoneAlreadyActiveError';
  }
}

export class SmsUnavailableError extends Error {
  readonly code = 'provider_unavailable';
  readonly httpStatus = 503;
  constructor() {
    super('Fournisseur SMS indisponible');
    this.name = 'SmsUnavailableError';
  }
}