import type { QuoteRepositoryPort, QuoteView } from '../ports/quote-repository.port';
import { QuoteService } from './quote.service';

const requestId = '10000000-0000-4000-8000-000000000001';
const key = '20000000-0000-4000-8000-000000000001';
const quote = { id: '30000000-0000-4000-8000-000000000001' } as QuoteView;

describe('QuoteService', () => {
  const repository: jest.Mocked<QuoteRepositoryPort> = {
    isPublishableProfessional: jest.fn(), create: jest.fn(),
  };
  const service = new QuoteService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.isPublishableProfessional.mockResolvedValue(true);
    repository.create.mockResolvedValue(quote);
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
