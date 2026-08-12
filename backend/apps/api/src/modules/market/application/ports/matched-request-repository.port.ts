export interface MatchedRequestView {
  id: string;
  category: { id: string; name: string; slug: string };
  title: string;
  description: string;
  country_code: string;
  commune: { id: string; name: string } | null;
  distance_km: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  desired_date: string | null;
  urgency: string;
  expires_at: string;
  created_at: string;
}

export interface MatchedRequestRepositoryPort {
  isPublishableProfessional(userId: string): Promise<boolean>;
  listMatched(userId: string, limit: number, cursor?: { createdAt: string; id: string }): Promise<MatchedRequestView[]>;
  findMatched(userId: string, requestId: string): Promise<MatchedRequestView | null>;
}

export const MatchedRequestRepositoryPortToken = Symbol('MatchedRequestRepositoryPort');
