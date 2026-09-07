import type {
  BookingRepositoryPort,
  BookingView,
  ReleaseIntent,
} from '../ports/booking-repository.port';
import type { PaymentGatewayPort } from '../../../pay/application/ports/payment-gateway.port';
import { BookingService } from './booking.service';
describe('BookingService', () => {
  const repo: jest.Mocked<BookingRepositoryPort> = {
    isActiveClient: jest.fn(),
    listSlots: jest.fn(),
    create: jest.fn(),
    confirm: jest.fn(),
    finalize: jest.fn(),
  };
  const gateway: jest.Mocked<PaymentGatewayPort> = {
    initiate: jest.fn(),
    confirm: jest.fn(),
    release: jest.fn(),
  };
  const service = new BookingService(repo, gateway);
  beforeEach(() => {
    jest.clearAllMocks();
    repo.finalize.mockReset();
    repo.isActiveClient.mockResolvedValue(true);
    repo.listSlots.mockResolvedValue([]);
  });
  it('rejette période invalide', async () => {
    await expect(
      service.slots('p', {
        from: '2026-08-20T00:00:00Z',
        to: '2026-08-19T00:00:00Z',
      }),
    ).rejects.toMatchObject({ code: 'invalid_slot_period' });
  });
  it('normalise idempotence et versions', async () => {
    repo.create.mockResolvedValue({ id: 'b' } as BookingView);
    await service.create('u', '10000000-0000-4000-8000-000000000001', {
      quote_id: '20000000-0000-4000-8000-000000000001',
      slot_id: '30000000-0000-4000-8000-000000000001',
      slot_version: 1,
      quote_version: 2,
      request_version: 3,
    });
    expect(repo.create).toHaveBeenCalledWith(
      'u',
      expect.objectContaining({
        requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });
  it.each([
    ['SLOT_CONFLICT', 'slot_conflict'],
    ['VERSION_CONFLICT', 'booking_version_conflict'],
    ['ILLEGAL_TRANSITION', 'booking_illegal_transition'],
  ] as const)('mappe %s', async (result, code) => {
    repo.create.mockResolvedValue(result);
    await expect(
      service.create('u', '10000000-0000-4000-8000-000000000001', {
        quote_id: '20000000-0000-4000-8000-000000000001',
        slot_id: '30000000-0000-4000-8000-000000000001',
        slot_version: 1,
        quote_version: 2,
        request_version: 3,
      }),
    ).rejects.toMatchObject({ code });
  });

  const view = (status: string): BookingView =>
    ({
      id: 'b',
      status,
      client_confirmed_at: null,
      pro_confirmed_at: null,
    }) as BookingView;
  const intent: ReleaseIntent = {
    bookingId: 'b',
    transactionId: 't',
    idempotencyKey: 'payout:t',
    amount: 10800,
    currency: 'XOF',
    countryCode: 'BJ',
    beneficiaryPhone: '6699070013',
    commissionRate: 10,
    commissionAmount: 1200,
  };
  it.each([
    ['NOT_FOUND', 'booking_not_found'],
    ['FORBIDDEN', 'forbidden'],
    ['ILLEGAL_STATE', 'booking_confirmed_invalid_state'],
  ] as const)('confirm : %s → erreur %s', async (kind, code) => {
    repo.confirm.mockResolvedValue({ kind });
    await expect(service.confirm('u', 'b')).rejects.toMatchObject({ code });
    expect(gateway.release).not.toHaveBeenCalled();
  });
  it.each([
    'FIRST_CONFIRMED',
    'ALREADY_CONFIRMED',
    'ALREADY_COMPLETED',
  ] as const)('confirm : %s → vue sans jamais appeler la release', async (kind) => {
    repo.confirm.mockResolvedValue({ kind, view: view('IN_PROGRESS') });
    await expect(service.confirm('u', 'b')).resolves.toMatchObject({
      status: 'IN_PROGRESS',
    });
    expect(gateway.release).not.toHaveBeenCalled();
    expect(repo.finalize).not.toHaveBeenCalled();
  });
  it('confirm : deuxième confirmation → release du NET puis finalisation', async () => {
    repo.confirm.mockResolvedValue({
      kind: 'SECOND_CONFIRMED',
      view: view('IN_PROGRESS'),
      release: intent,
    });
    gateway.release.mockResolvedValue({
      status: 'SUCCEEDED',
      providerCode: 'SIMULATOR',
      externalRef: 'REL-t-abc',
    });
    repo.finalize.mockResolvedValue({
      kind: 'COMPLETED',
      view: view('COMPLETED'),
    });
    await expect(service.confirm('u', 'b')).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(gateway.release).toHaveBeenCalledWith({
      reference: 't',
      idempotencyKey: 'payout:t',
      amount: 10800,
      currency: 'XOF',
      countryCode: 'BJ',
      beneficiaryPhone: '6699070013',
    });
    expect(repo.finalize).toHaveBeenCalledWith('b', intent, {
      status: 'SUCCEEDED',
      providerCode: 'SIMULATOR',
      externalRef: 'REL-t-abc',
    });
  });
  it('confirm : release FAILED → 502 sans COMPLETED', async () => {
    repo.confirm.mockResolvedValue({
      kind: 'SECOND_CONFIRMED',
      view: view('IN_PROGRESS'),
      release: intent,
    });
    gateway.release.mockResolvedValue({
      status: 'FAILED',
      providerCode: 'SIMULATOR',
      failureReason: 'simulated_provider_breakdown',
    });
    repo.finalize.mockResolvedValue({
      kind: 'RELEASE_FAILED',
      view: view('IN_PROGRESS'),
    });
    await expect(service.confirm('u', 'b')).rejects.toMatchObject({
      code: 'release_failed',
    });
  });
  it('finalize : booking DISPUTED → 409 sans appel provider supplémentaire', async () => {
    repo.confirm.mockResolvedValue({
      kind: 'RESUME_RELEASE',
      view: view('IN_PROGRESS'),
      release: intent,
    });
    gateway.release.mockResolvedValue({
      status: 'SUCCEEDED',
      providerCode: 'SIMULATOR',
      externalRef: 'REL-t-abc',
    });
    repo.finalize.mockResolvedValue({ kind: 'BOOKING_DISPUTED', view: view('DISPUTED') });
    await expect(service.confirm('u', 'b')).rejects.toMatchObject({ code: 'booking_disputed' });
    expect(gateway.release).toHaveBeenCalledTimes(1);
  });
  it('confirm : gateway injoignable → 502 (pas de COMPLETED)', async () => {
    repo.confirm.mockResolvedValue({
      kind: 'RESUME_RELEASE',
      view: view('IN_PROGRESS'),
      release: intent,
    });
    gateway.release.mockRejectedValue(new Error('network down'));
    repo.finalize.mockResolvedValue({ kind: 'RELEASE_FAILED', view: view('IN_PROGRESS') });
    await expect(service.confirm('u', 'b')).rejects.toMatchObject({
      code: 'release_failed',
    });
  });
  it('retry après résultat ambigu → MÊME clé d’idempotence, jamais de deuxième libération logique', async () => {
    repo.confirm.mockResolvedValueOnce({
      kind: 'SECOND_CONFIRMED',
      view: view('IN_PROGRESS'),
      release: intent,
    });
    gateway.release.mockRejectedValueOnce(new Error('network timeout'));
    repo.finalize.mockResolvedValueOnce({
      kind: 'RELEASE_FAILED',
      view: view('IN_PROGRESS'),
    });
    await expect(service.confirm('u', 'b')).rejects.toMatchObject({
      code: 'release_failed',
    });
    // Le provider a peut-être réellement libéré : le rejeu réutilise la même clé
    // (RESUME_RELEASE) → le simulateur répond avec la même ref, pas une nouvelle.
    repo.confirm.mockResolvedValueOnce({
      kind: 'RESUME_RELEASE',
      view: view('IN_PROGRESS'),
      release: intent,
    });
    gateway.release.mockResolvedValueOnce({
      status: 'SUCCEEDED',
      providerCode: 'SIMULATOR',
      externalRef: 'REL-t-abc',
    });
    repo.finalize.mockResolvedValueOnce({
      kind: 'COMPLETED',
      view: view('COMPLETED'),
    });
    await expect(service.confirm('u', 'b')).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    const keys = gateway.release.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toEqual(['payout:t', 'payout:t']);
  });
  it('crash simulé après release réussie (avant finalize) → rejeu idempotent, une seule release', async () => {
    repo.confirm.mockResolvedValue({
      kind: 'SECOND_CONFIRMED',
      view: view('IN_PROGRESS'),
      release: intent,
    });
    gateway.release.mockResolvedValue({
      status: 'SUCCEEDED',
      providerCode: 'SIMULATOR',
      externalRef: 'REL-t-abc',
    });
    // Crash : la libération a réussi côté provider, la transaction B n’a pas lieu.
    repo.finalize
      .mockRejectedValueOnce(new Error('crash after release'))
      .mockResolvedValueOnce({ kind: 'COMPLETED', view: view('COMPLETED') });
    await expect(service.confirm('u', 'b')).rejects.toThrow('crash after release');
    // Rejeu : les deux timestamps sont posés → RESUME_RELEASE avec la même clé.
    repo.confirm.mockResolvedValueOnce({
      kind: 'RESUME_RELEASE',
      view: view('IN_PROGRESS'),
      release: intent,
    });
    await expect(service.confirm('u', 'b')).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    const keys = gateway.release.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toEqual(['payout:t', 'payout:t']);
    expect(repo.finalize).toHaveBeenCalledTimes(2);
  });
});
