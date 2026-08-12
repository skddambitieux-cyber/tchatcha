import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  SearchCriteria,
  SearchCursor,
  SearchQueryPort,
  SearchQueryPortToken,
  SearchSort,
} from '../ports/search-query.port';
import type { SearchQueryDto } from '../../interface/http/dto/search-query.dto';

@Injectable()
export class SearchQueryService {
  constructor(
    @Inject(SearchQueryPortToken) private readonly repository: SearchQueryPort,
  ) {}

  async search(dto: SearchQueryDto) {
    const hasLat = dto.lat != null;
    const hasLon = dto.lon != null;
    if (hasLat !== hasLon) this.invalid('coordinates_required_together');
    if (dto.radius_km != null && (!hasLat || !hasLon)) {
      this.invalid('radius_requires_coordinates');
    }
    if (dto.min_price != null && dto.max_price != null && dto.min_price > dto.max_price) {
      this.invalid('invalid_price_range');
    }

    const q = dto.q?.trim() || undefined;
    const sort: SearchSort = dto.sort ?? (q ? 'relevance' : hasLat ? 'distance' : 'rating');
    if (sort === 'distance' && (!hasLat || !hasLon)) {
      this.invalid('distance_requires_coordinates');
    }
    if (sort === 'relevance' && !q) this.invalid('relevance_requires_query');

    const cursor = dto.cursor ? this.decodeCursor(dto.cursor, sort) : undefined;
    const criteria: SearchCriteria = {
      q,
      countryCode: dto.country_code.toUpperCase(),
      categoryId: dto.category_id,
      divisionId: dto.division_id,
      lat: dto.lat,
      lon: dto.lon,
      radiusKm: dto.radius_km,
      verified: dto.verified,
      minRating: dto.min_rating,
      minPrice: dto.min_price,
      maxPrice: dto.max_price,
      sort,
      limit: dto.limit,
      cursor,
    };
    const rows = await this.repository.search(criteria);
    const hasMore = rows.length > criteria.limit;
    const page = hasMore ? rows.slice(0, criteria.limit) : rows;
    return {
      items: page.map((row) => row.item),
      next_cursor: hasMore ? this.encodeCursor(page[page.length - 1].cursor) : null,
    };
  }

  private encodeCursor(cursor: SearchCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(value: string, sort: SearchSort): SearchCursor {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<SearchCursor>;
      if (
        parsed.sort !== sort ||
        (parsed.primary !== null && typeof parsed.primary !== 'number') ||
        (parsed.primary === null && sort !== 'price') ||
        typeof parsed.secondary !== 'number' ||
        typeof parsed.id !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(parsed.id)
      ) {
        this.invalid('invalid_cursor');
      }
      return parsed as SearchCursor;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      return this.invalid('invalid_cursor');
    }
  }

  private invalid(code: string): never {
    throw new BadRequestException({ code });
  }
}
