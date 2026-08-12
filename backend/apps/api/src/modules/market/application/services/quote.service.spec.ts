import type { QuoteRepositoryPort, QuoteView } from '../ports/quote-repository.port';
import { QuoteService } from './quote.service';

const requestId = '10000000-0000-4000-8000-000000000001';
const key = '20000000-0000-4000-8000-000000000001';
const quote = { id: '30000000-0000-4000-8000-000000000001' } as QuoteView;

describe('QuoteService', () => {
  const repository: jest.Mocked<QuoteRepositoryPort> = {
    isPublishableProfessional: jest.fn(), isActiveProfessional: jest.fn(), isActiveClient: jest.fn(),
    create: jest.fn(), listReceived: jest.fn(), listSent: jest.fn(), findAccessible: jest.fn(), withdraw: jest.fn(),
    counter: jest.fn(), history: jest.fn(),
  };
  const service = new QuoteService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.isPublishableProfessional.mockResolvedValue(true);
    repository.isActiveProfessional.mockResolvedValue(true);
    repository.isActiveClient.mockResolvedValue(true);
    repository.create.mockResolvedValue(quote);
  });

  it('pagine les devis reçus et contrôle leur propriétaire', async () => {
    const detail = { ...quote, created_at: '2026-08-12T10:00:00.000Z' } as never;
    repository.listReceived.mockResolvedValue([detail, detail]);
    const page = await service.listReceived('client-1', requestId, 1);
    expect(page.items).toHaveLength(1);
    expect(page.next_cursor).toEqual(expect.any(String));
    repository.listReceived.mockResolvedValue('NOT_FOUND');
    await expect(service.listReceived('client-1', requestId, 20)).rejects.toMatchObject({ code: 'request_not_found' });
  });

  it('limite le détail aux participants', async () => {
    repository.findAccessible.mockResolvedValue(null);
    await expect(service.detail('intrus', quote.id)).rejects.toMatchObject({ code: 'quote_not_found' });
  });

  it('retire avec version optimiste et mappe les conflits', async () => {
    repository.withdraw.mockResolvedValue('VERSION_CONFLICT');
    await expect(service.withdraw('pro-1', quote.id, 1)).rejects.toMatchObject({ code: 'quote_version_conflict' });
    repository.withdraw.mockResolvedValue('ILLEGAL_TRANSITION');
    await expect(service.withdraw('pro-1', quote.id, 1)).rejects.toMatchObject({ code: 'quote_illegal_transition' });
    repository.withdraw.mockResolvedValue('NOT_FOUND');
    await expect(service.withdraw('pro-1', quote.id, 1)).rejects.toMatchObject({ code: 'quote_not_found' });
  });

  it('normalise une contre-offre et mappe la limite', async () => {
    repository.counter.mockResolvedValue('LIMIT_REACHED');
    await expect(service.counter('client-1', quote.id, key,
      { price: 9000, version: 1, message: '  Accord ?  ' }))
      .rejects.toMatchObject({ code: 'counter_offer_limit_reached' });
    expect(repository.counter).toHaveBeenCalledWith('client-1', quote.id, expect.objectContaining({
      price: 9000, version: 1, message: 'Accord ?', requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it('masque l’historique aux tiers', async () => {
    repository.history.mockResolvedValue('NOT_FOUND');
    await expect(service.history('intrus', quote.id)).rejects.toMatchObject({ code: 'quote_not_found' });
  });

  it('normalise et empreinte le devis', async () => {
    await expect(service.create('user-1', requestId, key,
      { price: 12000, duration_days: 2, message: '  Intervention rapide  ' })).resolves.toBe(quote);
    expect(repository.create).toHaveBeenCalledWith('user-1', expect.objectContaining({
      requestId, price: 12000, durationDays: 2, message: 'Intervention rapide',
      requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it('impose un professionnel publiable et une clé UUID', async () => {
    repository.isPublishableProfessional.mockResolvedValue(false);
    await expect(service.create('user-1', requestId, key, { price: 1000 }))
      .rejects.toMatchObject({ code: 'professional_required' });
    repository.isPublishableProfessional.mockResolvedValue(true);
    await expect(service.create('user-1', requestId, undefined, { price: 1000 }))
      .rejects.toMatchObject({ code: 'idempotency_key_required' });
  });

  it.each([
    ['NOT_MATCHED', 'request_not_found'],
    ['ACTIVE_QUOTE_EXISTS', 'active_quote_exists'],
    ['IDEMPOTENCY_MISMATCH', 'idempotency_mismatch'],
  ] as const)('mappe %s vers %s', async (result, code) => {
    repository.create.mockResolvedValue(result);
    await expect(service.create('user-1', requestId, key, { price: 1000 }))
      .rejects.toMatchObject({ code });
  });
});
