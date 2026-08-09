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

export class RoleMismatchError extends Error {
  readonly code = 'state_conflict';
  readonly httpStatus = 409;
  constructor() {
    super('Rôle incompatible avec le compte existant');
    this.name = 'RoleMismatchError';
  }
}

export class CategoryRequiredError extends Error {
  readonly code = 'validation_failed';
  readonly httpStatus = 422;
  readonly details = [{ field: 'category_id', reason: 'required' }];
  constructor() {
    super('Catégorie requise pour un profil PROFESSIONAL');
    this.name = 'CategoryRequiredError';
  }
}

export class LocalityRequiredError extends Error {
  readonly code = 'validation_failed';
  readonly httpStatus = 422;
  readonly details = [{ field: 'locality_id', reason: 'required' }];
  constructor() {
    super('Localité requise pour un profil PROFESSIONAL');
    this.name = 'LocalityRequiredError';
  }
}

export class ZoneRequiredError extends Error {
  readonly code = 'validation_failed';
  readonly httpStatus = 422;
  readonly details: Array<{ field: string; reason: string }> = [
    { field: 'delivery_zone', reason: 'required' },
  ];
  constructor() {
    super('Zone de livraison requise pour un profil DELIVERER');
    this.name = 'ZoneRequiredError';
  }
}

export class RefreshUnknownError extends Error {
  readonly code = 'unauthorized';
  readonly httpStatus = 401;
  constructor() {
    super('Token de rafraîchissement inconnu');
    this.name = 'RefreshUnknownError';
  }
}

export class RefreshExpiredError extends Error {
  readonly code = 'refresh_expired';
  readonly httpStatus = 401;
  constructor() {
    super('Refresh token expiré');
    this.name = 'RefreshExpiredError';
  }
}

export class RefreshReusedError extends Error {
  readonly code = 'refresh_reused';
  readonly httpStatus = 401;
  constructor() {
    super('Refresh token déjà utilisé (rejeu détecté)');
    this.name = 'RefreshReusedError';
  }
}

export class DeviceMismatchError extends Error {
  readonly code = 'invalid_device';
  readonly httpStatus = 401;
  constructor() {
    super('Appareil inconnu pour cette session');
    this.name = 'DeviceMismatchError';
  }
}

export class TokenExpiredError extends Error {
  readonly code = 'token_expired';
  readonly httpStatus = 401;
  constructor() {
    super('Access token expiré');
    this.name = 'TokenExpiredError';
  }
}

export class SessionNotFoundError extends Error {
  readonly code = 'unauthorized';
  readonly httpStatus = 401;
  constructor() {
    super('Session introuvable');
    this.name = 'SessionNotFoundError';
  }
}

export class UserNotFoundError extends Error {
  readonly code = 'unauthorized';
  readonly httpStatus = 401;
  constructor() {
    super('Compte introuvable');
    this.name = 'UserNotFoundError';
  }
}

export class AccountAnonymizedError extends Error {
  readonly code = 'resource_unavailable';
  readonly httpStatus = 403;
  constructor() {
    super('Compte anonymis\u00e9');
    this.name = 'AccountAnonymizedError';
  }
}

export class EmailAlreadyRegisteredError extends Error {
  readonly code = 'email_already_registered';
  readonly httpStatus = 409;
  constructor() {
    super('Email d\u00e9j\u00e0 utilis\u00e9 par un autre compte');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

export class VersionConflictError extends Error {
  readonly code = 'version_conflict';
  readonly httpStatus = 409;
  constructor() {
    super('Le profil a \u00e9t\u00e9 modifi\u00e9 par un autre appareil');
    this.name = 'VersionConflictError';
  }
}

export class PendingOtpWriteError extends Error {
  readonly code = 'state_conflict';
  readonly httpStatus = 409;
  constructor() {
    super('Profil modifiable uniquement apr\u00e8s activation du compte');
    this.name = 'PendingOtpWriteError';
  }
}