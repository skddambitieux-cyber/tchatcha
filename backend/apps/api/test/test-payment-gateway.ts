import { randomUUID } from 'node:crypto';
import type {
  GatewayCharge, GatewayChargeInitiated, GatewayConfirmationEvent,
  GatewayRelease, GatewayReleaseResult, PaymentGatewayPort,
} from '../src/modules/pay/application/ports/payment-gateway.port';

/** Gateway uniquement destiné aux E2E : aucun seam de panne n'existe en production. */
export class TestPaymentGateway implements PaymentGatewayPort {
  private readonly released = new Map<string, string>();
  private readonly initiated = new Map<string, string>();
  private fail = false;
  private timeout = false;
  private delayMs = 0;
  readonly releaseCalls: GatewayRelease[] = [];

  setFailReleases(value: boolean) { this.fail = value; }
  setTimeoutReleases(value: boolean) { this.timeout = value; }
  setReleaseDelay(ms: number) { this.delayMs = ms; }

  async initiate(charge: GatewayCharge): Promise<GatewayChargeInitiated> {
    const externalRef = `SIM-${charge.reference}-${randomUUID().slice(0, 8)}`;
    this.initiated.set(charge.reference, externalRef);
    return { status: 'PENDING', providerCode: 'SIMULATOR', externalRef };
  }

  async confirm(charge: GatewayCharge): Promise<GatewayConfirmationEvent> {
    return { eventId: randomUUID(), providerCode: 'SIMULATOR', externalRef: this.initiated.get(charge.reference) ?? `SIM-${charge.reference}`, eventType: 'payment.succeeded', payload: { amount: charge.amount, currency: charge.currency } };
  }

  async release(release: GatewayRelease): Promise<GatewayReleaseResult> {
    this.releaseCalls.push({ ...release });
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.timeout) throw new Error('test provider timeout');
    if (this.fail) return { status: 'FAILED', providerCode: 'SIMULATOR', failureReason: 'test_provider_failure' };
    const prior = this.released.get(release.idempotencyKey);
    if (prior) return { status: 'SUCCEEDED', providerCode: 'SIMULATOR', externalRef: prior };
    const externalRef = `REL-${release.reference}-${randomUUID().slice(0, 8)}`;
    this.released.set(release.idempotencyKey, externalRef);
    return { status: 'SUCCEEDED', providerCode: 'SIMULATOR', externalRef };
  }
}
