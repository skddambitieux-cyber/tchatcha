export interface PublicProfessionalView {
  id: string;
  business_name: string | null;
  headline: string | null;
  description: string | null;
  experience_years: number | null;
  employees_count: number | null;
  verified: boolean;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  min_price: number | null;
  currency: string;
  website: string | null;
  social_links: Record<string, string> | null;
  country_code: string;
  services: Record<string, unknown>[];
  business_hours: Record<string, unknown>[];
  portfolio: Record<string, unknown>[];
  location: Record<string, unknown> | null;
  reputation: {
    score_visible: boolean;
    trust_score: number | null;
    trust_level: string;
    completed_jobs: number;
  };
}

export interface PublicProfessionalReadPort {
  findById(id: string): Promise<PublicProfessionalView | null>;
}

export const PublicProfessionalReadPortToken = Symbol('PublicProfessionalReadPort');
