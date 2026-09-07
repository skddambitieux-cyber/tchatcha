import { DisputeService } from './dispute.service';
import type { DisputeRepositoryPort } from '../ports/dispute-repository.port';
import { DisputeReason } from '../../interface/http/dto/dispute.dto';

describe('DisputeService', () => {
  let repo: jest.Mocked<DisputeRepositoryPort>;
  let service: DisputeService;
  const dto = { booking_id: '11111111-1111-4111-8111-111111111111', reason: DisputeReason.OTHER, description: ' problème ', media_ids: [] };

  beforeEach(() => {
    repo = { open: jest.fn(), findVisible: jest.fn() };
    service = new DisputeService(repo);
  });

  it('normalise la description et trie les médias avant le hash', async () => {
    repo.open.mockResolvedValue({ id: 'd' } as never);
    await service.open('u', '22222222-2222-4222-8222-222222222222', { ...dto, media_ids: ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'] });
    expect(repo.open).toHaveBeenCalledWith(expect.objectContaining({ dto: expect.objectContaining({ description: 'problème', media_ids: expect.any(Array) }), requestHash: expect.stringMatching(/^[0-9a-f]{64}$/) }));
  });

  it.each([
    ['NOT_FOUND', 'dispute_not_found'], ['FORBIDDEN', 'forbidden'],
    ['INVALID_STATE', 'booking_dispute_invalid_state'], ['ALREADY_OPEN', 'dispute_already_open'],
    ['IDEMPOTENCY_MISMATCH', 'idempotency_mismatch'], ['COMPLETION_IN_PROGRESS', 'completion_in_progress'],
    ['MEDIA_INVALID', 'media_invalid'],
  ] as const)('mappe %s', async (result, code) => {
    repo.open.mockResolvedValue(result);
    await expect(service.open('u', '22222222-2222-4222-8222-222222222222', dto)).rejects.toMatchObject({ code });
  });

  it('rejoue la même réponse via le repository', async () => {
    repo.open.mockResolvedValue({ id: 'd', status: 'OPEN' } as never);
    await expect(service.open('u', '22222222-2222-4222-8222-222222222222', dto)).resolves.toMatchObject({ id: 'd' });
  });

  it('masque un litige tiers comme introuvable', async () => {
    repo.findVisible.mockResolvedValue('FORBIDDEN');
    await expect(service.get('u', '11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({ code: 'dispute_not_found' });
  });
});
