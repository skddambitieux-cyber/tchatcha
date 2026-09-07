import { ReviewService } from './review.service';
import type { ReviewRepositoryPort } from '../ports/review-repository.port';

describe('ReviewService', () => {
  let repo: jest.Mocked<ReviewRepositoryPort>;
  let service: ReviewService;
  const dto = { booking_id: '11111111-1111-4111-8111-111111111111', rating: 5, punctuality: 4, quality: 5, price_ratio: 4, politeness: 5, comment: '  Bien  ', media_ids: [] };
  const key = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    repo = { create: jest.fn(), list: jest.fn() };
    service = new ReviewService(repo);
  });

  it('normalise le commentaire, trie les médias et hash le payload', async () => {
    repo.create.mockResolvedValue({ id: 'r' } as never);
    await service.create('u', key, { ...dto, media_ids: ['44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333'] });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ requestHash: expect.stringMatching(/^[0-9a-f]{64}$/), dto: expect.objectContaining({ comment: 'Bien', media_ids: ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'] }) }));
  });

  it.each([
    ['NOT_FOUND', 'booking_not_found'], ['FORBIDDEN', 'forbidden'], ['INVALID_STATE', 'review_booking_invalid_state'],
    ['ALREADY_EXISTS', 'review_already_exists'], ['IDEMPOTENCY_MISMATCH', 'idempotency_mismatch'], ['MEDIA_INVALID', 'review_media_not_found'],
  ] as const)('mappe %s vers %s', async (result, code) => {
    repo.create.mockResolvedValue(result);
    await expect(service.create('u', key, dto)).rejects.toMatchObject({ code });
  });

  it('rejoue la réponse du repository', async () => {
    repo.create.mockResolvedValue({ id: 'r', is_late: true } as never);
    await expect(service.create('u', key, dto)).resolves.toMatchObject({ id: 'r', is_late: true });
  });

  it('refuse une clé absente ou invalide', async () => {
    await expect(service.create('u', undefined, dto)).rejects.toMatchObject({ code: 'idempotency_key_invalid' });
  });
});
