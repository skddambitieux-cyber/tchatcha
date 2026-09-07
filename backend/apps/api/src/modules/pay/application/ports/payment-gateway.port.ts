/**
 * TCHATCHA — Port paiement (FCT-013). Isolateur de fournisseurs (ADR-015) :
 * MTN_MOMO, MOOV_MONEY, CELTIIS_CASH… vivent derrière ce port. Aucun opérateur
 * réel dans ce lot : l'adaptateur injecté est le simulateur interne (bug.md).
 */
export interface GatewayCharge {
  reference: string;
  amount: number;
  currency: string;
  countryCode: string;
  payerPhone: string;
}
export interface GatewayChargeInitiated {
  status: 'PENDING' | 'FAILED';
  providerCode: string;
  externalRef: string;
  failureReason?: string;
}
export interface GatewayConfirmationEvent {
  eventId: string;
  providerCode: string;
  externalRef: string;
  eventType: 'payment.succeeded' | 'payment.failed';
  payload: Record<string, unknown>;
}
/**
 * FCT-014 — libération de l'escrow (BR-091). L'appel est effectué par la couche
 * application HORS de toute transaction PostgreSQL (frontière architecturale
 * nette bug.md) : un futur fournisseur réseau ne sera jamais transactionnel
 * avec la base. Lot simulé : SUCCEEDED synchrone.
 *
 * Idempotence (bug.md FCT-014) : `idempotencyKey` est l'identité métier stable
 * de la libération — identique pour TOUS les retries d'un même booking
 * (dérivée de l'identité du paiement, jamais régénérée). Le fournisseur DOIT
 * être idempotent sur cette clé : un retry après résultat réseau ambigu
 * (timeout/crash) réutilise exactement la même clé et ne crée jamais une
 * deuxième libération. Le backstop base (uq_provider_ops_release_once) n'est
 * qu'une protection secondaire, jamais la seule.
 */
export interface GatewayRelease {
  /** Référence locale du paiement (pay.transactions.id) — non idempotente. */
  reference: string;
  /** Identité d'idempotence stable : réutilisée telle quelle sur chaque retry. */
  idempotencyKey: string;
  amount: number;
  currency: string;
  countryCode: string;
  beneficiaryPhone: string | null;
}
export interface GatewayReleaseResult {
  status: 'SUCCEEDED' | 'FAILED';
  providerCode: string;
  externalRef?: string;
  failureReason?: string;
}
export interface PaymentGatewayPort {
  /** D�marre la capturation c�t� fournisseur (simulateur : PENDING). */
  initiate(charge: GatewayCharge): Promise<GatewayChargeInitiated>;
  /**
   * Confirme la capturation apr�s autorisation OTP de l'utilisateur.
   * Le retour est un �v�nement fournisseur trait� par le chemin webhook partag�.
   */
  confirm(charge: GatewayCharge): Promise<GatewayConfirmationEvent>;
  /** Lib�re l'escrow (PAYOUT) — jamais appel� dans une transaction. */
  release(release: GatewayRelease): Promise<GatewayReleaseResult>;
}
export const PaymentGatewayPortToken = Symbol('PaymentGatewayPort');
