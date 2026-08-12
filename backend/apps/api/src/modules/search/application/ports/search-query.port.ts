export type SearchSort = 'relevance' | 'distance' | 'rating' | 'price';

export interface SearchCursor {
  sort: SearchSort;
  primary: number | null;
  secondary: number;
  id: string;
}

export interface SearchCriteria {
  q?: string;
  countryCode: string;
  categoryId?: string;
  divisionId?: string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  verified?: boolean;
  minRating?: number;
  minPrice?: number;
  maxPrice?: number;
  sort: SearchSort;
  limit: number;
  cursor?: SearchCursor;
}

export interface SearchResultItem {
  id: string;
  business_name: string | null;
  headline: string | null;
  verified: boolean;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  min_price: number | null;
  currency: string;
  commune: { id: string; name: string } | null;
  distance_km: number | null;
  primary_service: {
    id: string;
    title: string;
    category: { id: string; name: string; slug: string } | null;
  } | null;
  image_url: string | null;
}

export interface SearchPageRow {
  item: SearchResultItem;
  cursor: SearchCursor;
}

export interface SearchQueryPort {
  search(criteria: SearchCriteria): Promise<SearchPageRow[]>;
}

export const SearchQueryPortToken = Symbol('SearchQueryPort');
