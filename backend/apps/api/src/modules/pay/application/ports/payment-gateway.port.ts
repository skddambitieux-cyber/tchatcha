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
export interface PaymentGatewayPort {
  /** Démarre la capturation côté fournisseur (simulateur : PENDING). */
  initiate(charge: GatewayCharge): Promise<GatewayChargeInitiated>;
  /**
   * Confirme la capturation après autorisation OTP de l'utilisateur.
   * Le retour est un événement fournisseur traité par le chemin webhook partagé.
   */
  confirm(charge: GatewayCharge): Promise<GatewayConfirmationEvent>;
}
export const PaymentGatewayPortToken = Symbol('PaymentGatewayPort');
