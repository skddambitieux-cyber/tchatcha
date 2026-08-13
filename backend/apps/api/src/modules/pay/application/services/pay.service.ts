/**
 * TCHATCHA — PayService (FCT-013, cadrage bug.md).
 * - initiate → transaction PENDING (demande reste SELECTED).
 * - verify : OTP PAYMENT = autorisation utilisateur → AUTHORIZED (demande
 *   reste SELECTED) ; la confirmation fournisseur passe ensuite par le MÊME
 *   traitement que les webhooks (verify n'écrit jamais SUCCEEDED lui-même).
 * - Seul SUCCEEDED déclenche SELECTED → PAID, atomiquement (repository.confirm).
 * - FAILED est terminal pour la tentative ; nouvelle tentative = nouvelle
 *   Idempotency-Key. Un seul SUCCEEDED par booking, garanti en base
 *   (uq_transactions_booking_succeeded).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpService } from '../../../auth/application/services/otp.service';
import { OtpPurpose } from '../../../auth/domain/entities/otp-code.entity';
import { PayRepositoryPortToken } from '../ports/pay-repository.port';
import type { PayRepositoryPort, PaymentView } from '../ports/pay-repository.port';
import { PaymentGatewayPortToken } from '../ports/payment-gateway.port';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import { SIMULATOR_WEBHOOK_SECRET } from '../../infrastructure/gateways/simulator-payment.gateway';
import {
  PaymentAlreadySucceededError,
  PaymentFailedError,
  PaymentForbiddenError,
  PaymentGatewayError,
  PaymentIdempotencyMismatchError,
  PaymentIllegalTransitionError,
  PaymentInvalidError,
  PaymentNotFoundError,
  WebhookInvalidError,
  WebhookSignatureInvalidError,
  WebhookUnknownEventError,
} from '../../domain/errors/pay-errors';

export interface WebhookResult {
  status: 'processed' | 'replayed';
}

const KNOWN_WEBHOOK_EVENTS = new Set(['payment.succeeded', 'payment.failed']);
const IDEMPOTENCY_KEY_RE = /^[0-9a-f-]{36}$/i;

function hashInitiateBody(bookingId: string): string {
  return createHash('sha256').update(bookingId).digest('hex');
}

@Injectable()
export class PayService {
  constructor(
    @Inject(PayRepositoryPortToken)
    private readonly repository: PayRepositoryPort,
    @Inject(PaymentGatewayPortToken)
    private readonly gateway: PaymentGatewayPort,
    private readonly otp: OtpService,
    private readonly config: ConfigService,
  ) {}

  async initiate(userId: string, key: string | undefined, bookingId: string): Promise<PaymentView> {
    if (!(await this.repository.isActiveClient(userId)))
      throw new PaymentForbiddenError();
    if (!key || !IDEMPOTENCY_KEY_RE.test(key))
      throw new PaymentInvalidError('idempotency_key_required');
    const result = await this.repository.createPayment(userId, {
      bookingId,
      idempotencyKey: key,
      requestHash: hashInitiateBody(bookingId),
    });
    if (result === 'NOT_FOUND') throw new PaymentNotFoundError();
    if (result === 'ILLEGAL_TRANSITION')
      throw new PaymentIllegalTransitionError();
    if (result === 'ALREADY_SUCCEEDED')
      throw new PaymentAlreadySucceededError();
    if (result === 'IDEMPOTENCY_MISMATCH')
      throw new PaymentIdempotencyMismatchError();
    // Montant/devise : valeur serveur (booking ← devis accepté), jamais du client.
    const initiated = await this.gateway.initiate({
      reference: result.id,
      amount: result.amount,
      currency: result.currency,
      countryCode: result.country_code,
      payerPhone: result.payer_phone,
    });
    if (initiated.status === 'FAILED') {
      await this.repository.markFailed(result.id);
      throw new PaymentGatewayError();
    }
    await this.repository.bindOperation(
      result.id,
      initiated.providerCode,
      initiated.externalRef,
    );
    return (await this.repository.findById(userId, result.id)) ?? result;
  }

  async get(userId: string, paymentId: string): Promise<PaymentView> {
    const view = await this.repository.findById(userId, paymentId);
    if (!view) throw new PaymentNotFoundError();
    return view;
  }

  /**
   * Vérifie l'OTP PAYMENT (autorisation utilisateur) puis sollicite le
   * fournisseur. La confirmation est traitée par le chemin webhook partagé.
   */
  async verify(userId: string, paymentId: string, code: string): Promise<PaymentView> {
    const view = await this.repository.findById(userId, paymentId);
    if (!view) throw new PaymentNotFoundError();
    if (view.status === 'SUCCEEDED') return view;
    await this.otp.verify({
      countryCode: view.country_code,
      phone: view.payer_phone,
      code,
      purpose: OtpPurpose.PAYMENT,
    });
    const authorized = await this.repository.authorize(paymentId);
    if (authorized === 'NOT_FOUND') throw new PaymentNotFoundError();
    if (authorized === 'ALREADY_SUCCEEDED') return view;
    if (authorized === 'FAILED') throw new PaymentFailedError();
    const event = await this.gateway.confirm({
      reference: paymentId,
      amount: view.amount,
      currency: view.currency,
      countryCode: view.country_code,
      payerPhone: view.payer_phone,
    });
    await this.processWebhook(event.providerCode, {
      event_id: event.eventId,
      event_type: event.eventType,
      external_ref: event.externalRef,
      ...event.payload,
    });
    return (await this.repository.findById(userId, paymentId)) ?? view;
  }

  /** Webhook fournisseur : signature HMAC (12 §8), déduplication, traitement. */
  async handleWebhook(
    providerCode: string,
    signature: string | undefined,
    rawBody: Buffer,
  ): Promise<WebhookResult> {
    if (!signature) throw new WebhookSignatureInvalidError();
    this.assertSignature(signature, rawBody);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new WebhookInvalidError('malformed_json');
    }
    return this.processWebhook(providerCode, body);
  }

  /** Chemin unique de traitement des confirmations fournisseur (webhook = verify). */
  async processWebhook(
    providerCode: string,
    body: Record<string, unknown>,
  ): Promise<WebhookResult> {
    if (
      typeof body.event_type !== 'string' ||
      typeof body.external_ref !== 'string' ||
      body.external_ref.length === 0
    )
      throw new WebhookInvalidError();
    const eventType = body.event_type;
    if (!KNOWN_WEBHOOK_EVENTS.has(eventType))
      throw new WebhookUnknownEventError();
    const recorded = await this.repository.recordWebhook({
      providerCode,
      externalRef: body.external_ref,
      eventType,
      payload: body,
    });
    if (recorded === 'DUPLICATE') return { status: 'replayed' };
    const txn = await this.repository.resolveTransaction(
      providerCode,
      body.external_ref,
    );
    if (!txn) throw new WebhookInvalidError('external_ref_not_found');
    if (eventType === 'payment.failed') {
      const failed = await this.repository.markFailed(txn.id);
      if (failed === 'NOT_FOUND') throw new PaymentNotFoundError();
      await this.repository.markWebhookProcessed(
        providerCode,
        body.external_ref,
        eventType,
        null,
      );
      return { status: 'processed' };
    }
    const confirmed = await this.repository.confirm(txn.id);
    switch (confirmed) {
      case 'CONFIRMED':
        await this.repository.markWebhookProcessed(
          providerCode,
          body.external_ref,
          eventType,
          null,
        );
        return { status: 'processed' };
      case 'ALREADY_SUCCEEDED':
        await this.repository.markWebhookProcessed(
          providerCode,
          body.external_ref,
          eventType,
          'payment_already_succeeded',
        );
        throw new PaymentAlreadySucceededError();
      case 'FAILED':
        await this.repository.markWebhookProcessed(
          providerCode,
          body.external_ref,
          eventType,
          'payment_failed_state',
        );
        throw new PaymentFailedError();
      case 'REQUEST_ILLEGAL_TRANSITION':
        await this.repository.markWebhookProcessed(
          providerCode,
          body.external_ref,
          eventType,
          'request_illegal_transition',
        );
        throw new PaymentIllegalTransitionError();
      default:
        throw new PaymentNotFoundError();
    }
  }

  /** `sha256=HMAC(secret, raw body)` — 12-api-blueprint.md §8. */
  private assertSignature(signature: string, rawBody: Buffer): void {
    const [algorithm, provided] = signature.split('=', 2);
    if (algorithm !== 'sha256' || !provided) {
      throw new WebhookSignatureInvalidError();
    }
    // @nestjs/config ne propage pas les défauts des classes validées en lecture
    // (convention codebase : fallback à la lecture, cf. media-storage.config.ts).
    const configured =
      this.config.get<string>('PAYMENT_WEBHOOK_SECRET') ??
      process.env.PAYMENT_WEBHOOK_SECRET;
    const secret =
      configured ||
      (this.config.get<string>('NODE_ENV', 'development') !== 'production'
        ? SIMULATOR_WEBHOOK_SECRET
        : '');
    if (!secret) throw new WebhookSignatureInvalidError();
    const computed = createHmac('sha256', secret).update(rawBody).digest();
    let given: Buffer;
    try {
      given = Buffer.from(provided, 'hex');
    } catch {
      throw new WebhookSignatureInvalidError();
    }
    if (
      given.length !== computed.length ||
      !timingSafeEqual(given, computed)
    ) {
      throw new WebhookSignatureInvalidError();
    }
  }
}
