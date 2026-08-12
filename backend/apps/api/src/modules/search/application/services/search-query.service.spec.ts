import { BadRequestException } from '@nestjs/common';
import type { SearchQueryPort } from '../ports/search-query.port';
import { SearchQueryService } from './search-query.service';

describe('SearchQueryService', () => {
  const repository: jest.Mocked<SearchQueryPort> = { search: jest.fn() };
  const service = new SearchQueryService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.search.mockResolvedValue([]);
  });

  it.each([
    [{ q: 'plombier', country_code: 'BJ', limit: 20 }, 'relevance'],
    [{ lat: 6.37, lon: 2.42, country_code: 'BJ', limit: 20 }, 'distance'],
    [{ country_code: 'BJ', limit: 20 }, 'rating'],
  ])('choisit le tri par défaut contractuel', async (dto, expected) => {
    await service.search(dto);
    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({ sort: expected }),
    );
  });

  it.each([
    [{ lat: 6.37, country_code: 'BJ', limit: 20 }, 'coordinates_required_together'],
    [{ radius_km: 5, country_code: 'BJ', limit: 20 }, 'radius_requires_coordinates'],
    [{ sort: 'distance', country_code: 'BJ', limit: 20 }, 'distance_requires_coordinates'],
    [{ sort: 'relevance', country_code: 'BJ', limit: 20 }, 'relevance_requires_query'],
    [{ min_price: 10, max_price: 5, country_code: 'BJ', limit: 20 }, 'invalid_price_range'],
  ])('rejette les combinaisons invalides', async (dto, code) => {
    await expect(service.search(dto)).rejects.toMatchObject({
      response: { code },
    });
  });

  it('produit puis relit un curseur opaque lié au tri', async () => {
    const row = (id: string, rating: number) => ({
      item: { id } as never,
      cursor: { sort: 'rating' as const, primary: rating, secondary: 2, id },
    });
    repository.search.mockResolvedValue([
      row('10000000-0000-4000-8000-000000000001', 5),
      row('10000000-0000-4000-8000-000000000002', 4),
    ]);
    const first = await service.search({ country_code: 'BJ', limit: 1 });
    expect(first.next_cursor).toEqual(expect.any(String));
    const cursor = first.next_cursor;
    if (!cursor) throw new Error('curseur attendu');

    repository.search.mockResolvedValue([]);
    await service.search({
      country_code: 'BJ',
      limit: 1,
      sort: 'rating',
      cursor,
    });
    expect(repository.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: expect.objectContaining({
          id: '10000000-0000-4000-8000-000000000001',
          sort: 'rating',
        }),
      }),
    );
  });

  it('rejette un curseur illisible ou associé à un autre tri', async () => {
    await expect(service.search({
      country_code: 'BJ', limit: 20, cursor: 'illisible',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
