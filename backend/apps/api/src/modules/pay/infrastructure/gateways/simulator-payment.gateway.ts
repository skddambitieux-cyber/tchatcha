/**
 * TCHATCHA — Simulateur de passerelle de paiement (FCT-013, bug.md).
 * Aucun opérateur réel dans ce lot (MTN_MOMO/MOOV_MONEY viendront derrière
 * PaymentGatewayPort — ADR-015). Déterministe : initiate → PENDING,
 * confirm → payment.succeeded. C'est la « confirmation fournisseur » : elle
 * est livrée par le même chemin que les webhooks (traitement partagé).
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  GatewayCharge,
  GatewayChargeInitiated,
  GatewayConfirmationEvent,
  PaymentGatewayPort,
} from '../../application/ports/payment-gateway.port';

/** Secret HMAC des webhooks du simulateur (défaut non production). */
export const SIMULATOR_WEBHOOK_SECRET = 'tchatcha-sim-webhook-secret';
export const SIMULATOR_PROVIDER_CODE = 'SIMULATOR';

@Injectable()
export class SimulatorPaymentGateway implements PaymentGatewayPort {
  /** Référence fournisseur émise à l'initiate, par référence locale (stateless sinon). */
  private readonly initiatedRefs = new Map<string, string>();

  async initiate(charge: GatewayCharge): Promise<GatewayChargeInitiated> {
    const externalRef = `SIM-${charge.reference}-${randomUUID().slice(0, 8)}`;
    this.initiatedRefs.set(charge.reference, externalRef);
    return {
      status: 'PENDING',
      providerCode: SIMULATOR_PROVIDER_CODE,
      externalRef,
    };
  }

  async confirm(charge: GatewayCharge): Promise<GatewayConfirmationEvent> {
    const externalRef =
      this.initiatedRefs.get(charge.reference) ??
      `SIM-${charge.reference}-${randomUUID().slice(0, 8)}`;
    return {
      eventId: randomUUID(),
      providerCode: SIMULATOR_PROVIDER_CODE,
      externalRef,
      eventType: 'payment.succeeded',
      payload: {
        amount: charge.amount,
        currency: charge.currency,
        country_code: charge.countryCode,
        payer_phone: charge.payerPhone,
        reference: charge.reference,
      },
    };
  }
}