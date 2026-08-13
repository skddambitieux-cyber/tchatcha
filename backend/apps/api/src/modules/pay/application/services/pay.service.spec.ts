/**
 * Tests unitaires PayService (FCT-013) — machine d'états, idempotence,
 * atomicité, chemin webhook partagé, signature HMAC. Fakes de ports injectés.
 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { OtpService } from '../../../auth/application/services/otp.service';
import { OtpInvalidError } from '../../../auth/domain/errors/auth-errors';
import type {
  AuthorizeResult,
  ConfirmResult,
  CreatePaymentResult,
  MarkFailedResult,
  PaymentView,
  PayRepositoryPort,
  WebhookRecordInput,
} from '../ports/pay-repository.port';
import { PayRepositoryPortToken } from '../ports/pay-repository.port';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import { PaymentGatewayPortToken } from '../ports/payment-gateway.port';
import {
  PaymentAlreadySucceededError,
  PaymentFailedError,
  PaymentIdempotencyMismatchError,
  PaymentIllegalTransitionError,
  PaymentNotFoundError,
  WebhookInvalidError,
  WebhookSignatureInvalidError,
  WebhookUnknownEventError,
} from '../../domain/errors/pay-errors';
import { PayService } from './pay.service';
import { SIMULATOR_WEBHOOK_SECRET } from '../../infrastructure/gateways/simulator-payment.gateway';

const view = (over: Partial<PaymentView> = {}): PaymentView => ({
  id: randomUUID(),
  type: 'SERVICE_PAYMENT',
  status: 'PENDING',
  amount: 12000,
  currency: 'XOF',
  booking_id: randomUUID(),
  payer_phone: '6699070001',
  country_code: 'BJ',
  version: 1,
  created_at: '2026-08-13T10:00:00.000Z',
  ...over,
});

const REPOSITORY: PayRepositoryPort = {
  isActiveClient: jest.fn().mockResolvedValue(true),
  createPayment: jest.fn(),
  bindOperation: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn(),
  authorize: jest.fn(),
  confirm: jest.fn(),
  markFailed: jest.fn(),
  resolveTransaction: jest.fn(),
  recordWebhook: jest.fn(),
  markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
};

const GATEWAY: PaymentGatewayPort = {
  initiate: jest.fn().mockResolvedValue({
    status: 'PENDING',
    providerCode: 'SIMULATOR',
    externalRef: 'SIM-ref',
  }),
  confirm: jest.fn().mockResolvedValue({
    eventId: randomUUID(),
    providerCode: 'SIMULATOR',
    externalRef: 'SIM-ok',
    eventType: 'payment.succeeded',
    payload: {},
  }),
};

class FakeOtpService {
  verify = jest.fn().mockResolvedValue({ status: 'otp_verified' });
}

const signWebhook = (body: object) =>
  `sha256=${createHmac('sha256', SIMULATOR_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex')}`;

let otp: FakeOtpService;

async function build() {
  otp = new FakeOtpService();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PayService,
      { provide: PayRepositoryPortToken, useValue: REPOSITORY },
      { provide: PaymentGatewayPortToken, useValue: GATEWAY },
      { provide: OtpService, useValue: otp },
      { provide: ConfigService, useValue: { get: jest.fn((k: string) => (k === 'PAYMENT_WEBHOOK_SECRET' ? SIMULATOR_WEBHOOK_SECRET : undefined)) } },
    ],
  }).compile();
  return moduleRef.get(PayService);
}
beforeEach(() => {
  jest.clearAllMocks();
  (REPOSITORY.isActiveClient as jest.Mock).mockResolvedValue(true);
  (REPOSITORY.findById as jest.Mock).mockResolvedValue(null);
  (REPOSITORY.bindOperation as jest.Mock).mockResolvedValue(undefined);
  (REPOSITORY.markWebhookProcessed as jest.Mock).mockResolvedValue(undefined);
  (GATEWAY.initiate as jest.Mock).mockResolvedValue({
    status: 'PENDING',
    providerCode: 'SIMULATOR',
    externalRef: 'SIM-ref',
  });
  (GATEWAY.confirm as jest.Mock).mockResolvedValue({
    eventId: randomUUID(),
    providerCode: 'SIMULATOR',
    externalRef: 'SIM-ok',
    eventType: 'payment.succeeded',
    payload: {},
  });
});

describe('PayService.initiate', () => {
  it('exige une Idempotency-Key UUID valide', async () => {
    const svc = await build();
    REPOSITORY.createPayment.mockResolvedValue(view());
    await expect(svc.initiate('u1', 'nope', randomUUID())).rejects.toMatchObject({
      code: 'idempotency_key_required',
      httpStatus: 422,
    });
  });
  it('rejette un client inactif', async () => {
    const svc = await build();
    REPOSITORY.isActiveClient.mockResolvedValue(false);
    await expect(
      svc.initiate('u1', randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ code: 'client_required', httpStatus: 403 });
  });
  it('crée la transaction puis lie l’opération fournisseur', async () => {
    const svc = await build();
    const created = view({ id: 'txn-1' });
    REPOSITORY.createPayment.mockResolvedValue(created);
    REPOSITORY.findById.mockResolvedValue(created);
    const out = await svc.initiate('u1', randomUUID(), randomUUID());
    expect(out.status).toBe('PENDING');
    expect(GATEWAY.initiate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12000, currency: 'XOF' }),
    );
    expect(REPOSITORY.bindOperation).toHaveBeenCalledWith(
      'txn-1',
      'SIMULATOR',
      'SIM-ref',
    );
  });
  it('rejoue la même clé (même body) et renvoie la transaction d’origine', async () => {
    const svc = await build();
    const created = view({ id: 'txn-1' });
    REPOSITORY.createPayment.mockResolvedValue(created);
    expect(await svc.initiate('u1', randomUUID(), randomUUID())).toBe(created);
  });
  it('409 si la clé est réutilisée avec un contenu différent', async () => {
    const svc = await build();
    REPOSITORY.createPayment.mockResolvedValue('IDEMPOTENCY_MISMATCH');
    await expect(
      svc.initiate('u1', randomUUID(), randomUUID()),
    ).rejects.toBeInstanceOf(PaymentIdempotencyMismatchError);
  });
  it('409 si un SUCCEEDED existe déjà pour le booking', async () => {
    const svc = await build();
    REPOSITORY.createPayment.mockResolvedValue('ALREADY_SUCCEEDED');
    await expect(
      svc.initiate('u1', randomUUID(), randomUUID()),
    ).rejects.toBeInstanceOf(PaymentAlreadySucceededError);
  });
  it('409 si le booking n’est pas dans un état paiable', async () => {
    const svc = await build();
    REPOSITORY.createPayment.mockResolvedValue('ILLEGAL_TRANSITION');
    await expect(
      svc.initiate('u1', randomUUID(), randomUUID()),
    ).rejects.toBeInstanceOf(PaymentIllegalTransitionError);
  });
  it('404 paiement introuvable', async () => {
    const svc = await build();
    REPOSITORY.createPayment.mockResolvedValue('NOT_FOUND');
    await expect(
      svc.initiate('u1', randomUUID(), randomUUID()),
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });
});

describe('PayService.verify', () => {
  it('valide l’OTP PAYMENT puis confirme via le chemin webhook partagé', async () => {
    const svc = await build();
    const pending = view({ id: 'txn-1' });
    REPOSITORY.findById
      .mockResolvedValueOnce(pending) // état courant
      .mockResolvedValueOnce(view({ id: 'txn-1', status: 'SUCCEEDED' })); // après
    REPOSITORY.authorize.mockResolvedValue('AUTHORIZED');
    REPOSITORY.recordWebhook.mockResolvedValue('INSERTED');
    REPOSITORY.resolveTransaction.mockResolvedValue({ id: 'txn-1' });
    REPOSITORY.confirm.mockResolvedValue('CONFIRMED');
    const out = await svc.verify('u1', 'txn-1', '123456');
    expect(otp.verify).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'PAYMENT', code: '123456' }),
    );
    // SUCCEEDED n'a JAMAIS été écrit directement par verify : confirmation
    // passée par le traitement dédupliqué (recordWebhook → confirm).
    expect(REPOSITORY.recordWebhook).toHaveBeenCalled();
    expect(REPOSITORY.confirm).toHaveBeenCalledWith('txn-1');
    expect(out.status).toBe('SUCCEEDED');
  });
  it('propague un OTP invalide (401) sans toucher au statut', async () => {
    const svc = await build();
    REPOSITORY.findById.mockResolvedValue(view({ id: 'txn-1' }));
    otp.verify.mockRejectedValue(new OtpInvalidError(2));
    await expect(svc.verify('u1', 'txn-1', '000000')).rejects.toBeInstanceOf(
      OtpInvalidError,
    );
    expect(REPOSITORY.authorize).not.toHaveBeenCalled();
  });
  it('404 si le paiement appartient à un tiers', async () => {
    const svc = await build();
    REPOSITORY.findById.mockResolvedValue(null);
    await expect(svc.verify('tiers', 'txn-1', '123456')).rejects.toBeInstanceOf(
      PaymentNotFoundError,
    );
  });
  it('idempotent si déjà SUCCEEDED', async () => {
    const svc = await build();
    const done = view({ id: 'txn-1', status: 'SUCCEEDED' });
    REPOSITORY.findById.mockResolvedValue(done);
    await expect(svc.verify('u1', 'txn-1', '123456')).resolves.toBe(done);
    expect(otp.verify).not.toHaveBeenCalled();
  });
  it('409 si la tentative est terminale FAILED', async () => {
    const svc = await build();
    REPOSITORY.findById.mockResolvedValue(view({ id: 'txn-1', status: 'FAILED' }));
    REPOSITORY.authorize.mockResolvedValue('FAILED');
    await expect(svc.verify('u1', 'txn-1', '123456')).rejects.toBeInstanceOf(
      PaymentFailedError,
    );
  });
});

describe('PayService.processWebhook', () => {
  it('déduplique le rejeu du même événement (200 replayed, pas de double débit)', async () => {
    const svc = await build();
    REPOSITORY.recordWebhook.mockResolvedValue('DUPLICATE');
    await expect(
      svc.processWebhook('SIMULATOR', {
        event_id: 'e1',
        event_type: 'payment.succeeded',
        external_ref: 'SIM-x',
      }),
    ).resolves.toEqual({ status: 'replayed' });
    expect(REPOSITORY.confirm).not.toHaveBeenCalled();
  });
  it('SUCCEEDED + transition SELECTED→PAID atomique (confirm appelé)', async () => {
    const svc = await build();
    REPOSITORY.recordWebhook.mockResolvedValue('INSERTED');
    REPOSITORY.resolveTransaction.mockResolvedValue({ id: 'txn-1' });
    REPOSITORY.confirm.mockResolvedValue('CONFIRMED');
    await expect(
      svc.processWebhook('SIMULATOR', {
        event_id: 'e1',
        event_type: 'payment.succeeded',
        external_ref: 'SIM-x',
      }),
    ).resolves.toEqual({ status: 'processed' });
    expect(REPOSITORY.markWebhookProcessed).toHaveBeenCalledWith(
      'SIMULATOR',
      'SIM-x',
      'payment.succeeded',
      null,
    );
  });
  it('409 si le paiement est déjà SUCCEEDED (deux confirmations concurrentes)', async () => {
    const svc = await build();
    REPOSITORY.recordWebhook.mockResolvedValue('INSERTED');
    REPOSITORY.resolveTransaction.mockResolvedValue({ id: 'txn-1' });
    REPOSITORY.confirm.mockResolvedValue('ALREADY_SUCCEEDED');
    await expect(
      svc.processWebhook('SIMULATOR', {
        event_id: 'e2',
        event_type: 'payment.succeeded',
        external_ref: 'SIM-y',
      }),
    ).rejects.toBeInstanceOf(PaymentAlreadySucceededError);
  });
  it('422 pour un type d’événement inconnu', async () => {
    const svc = await build();
    await expect(
      svc.processWebhook('SIMULATOR', {
        event_id: 'e3',
        event_type: 'payment.mystery',
        external_ref: 'SIM-z',
      }),
    ).rejects.toBeInstanceOf(WebhookUnknownEventError);
  });
  it('400 pour un corps malformé (absence external_ref)', async () => {
    const svc = await build();
    await expect(
      svc.processWebhook('SIMULATOR', { event_id: 'e4' }),
    ).rejects.toBeInstanceOf(WebhookInvalidError);
  });
});

describe('PayService.handleWebhook (signature HMAC)', () => {
  it('rejette sans signature', async () => {
    const svc = await build();
    await expect(
      svc.handleWebhook('SIMULATOR', undefined, Buffer.from('{}')),
    ).rejects.toBeInstanceOf(WebhookSignatureInvalidError);
  });
  it('rejette une signature invalide', async () => {
    const svc = await build();
    await expect(
      svc.handleWebhook('SIMULATOR', 'sha256=fake', Buffer.from('{}')),
    ).rejects.toBeInstanceOf(WebhookSignatureInvalidError);
  });
  it('rejette un corps signé avec un autre secret', async () => {
    const svc = await build();
    const body = JSON.stringify({ event_id: 'x' });
    const sig = `sha256=${createHmac('sha256', 'autre-secret').update(body).digest('hex')}`;
    await expect(
      svc.handleWebhook('SIMULATOR', sig, Buffer.from(body)),
    ).rejects.toBeInstanceOf(WebhookSignatureInvalidError);
  });
  it('accepte une signature valide puis traite', async () => {
    const svc = await build();
    const body = {
      event_id: 'e9',
      event_type: 'payment.failed',
      external_ref: 'SIM-f',
    };
    REPOSITORY.recordWebhook.mockResolvedValue('INSERTED');
    REPOSITORY.resolveTransaction.mockResolvedValue({ id: 'txn-1' });
    REPOSITORY.markFailed.mockResolvedValue('FAILED');
    await expect(
      svc.handleWebhook('SIMULATOR', signWebhook(body), Buffer.from(JSON.stringify(body))),
    ).resolves.toEqual({ status: 'processed' });
    expect(REPOSITORY.markFailed).toHaveBeenCalledWith('txn-1');
  });
});