/**
 * TCHATCHA — Port local : lecture de la vitrine professionnelle (6.3.3, 35 §5).
 * Port du module professionals : le service dépend du port, l'adaptateur
 * (TypeOrmProfessionalShowcaseReader) mappe pros + media + geo (35 §2 RF-PW09).
 */

/** identité commerciale + guards user (35 §4) */
export interface ShowcaseProfile {
  id: string;
  user_id: string;
  version: number;
  business_name: string | null;
  headline: string | null;
  description: string | null;
  experience_years: number | null;
  employees_count: number | null;
  status: string;
  verified: boolean;
  verified_at: Date | null;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  min_price: number | null;
  currency: string;
  website: string | null;
  social_links: Record<string, string> | null;
  /** guards 35 §2 RF-PW03 — état du compte propriétaire */
  user_status: string;
  anonymized_at: Date | null;
  /** rôle du propriétaire (RF-PW02 : non-PRO → 404 professional_not_found) */
  role: string | null;
}

export interface ShowcaseLocation {
  country_code: string;
  division_id: string | null;
  division_name: string | null;
  /** RF-PW04 : geo.divisions.name sinon address_text sinon null */
  location_name: string | null;
  lat: number | null;
  lon: number | null;
  service_radius_km: number;
  address_text: string | null;
}

export interface ShowcaseService {
  id: string;
  category_id: string;
  category_name: string | null;
  slug: string | null;
  title: string;
  description: string | null;
  price_from: number | null;
  price_to: number | null;
  price_unit: string | null;
  is_primary: boolean;
  sort_order: number;
}

export interface ShowcaseBusinessHour {
  weekday: number;
  open_at: string;
  close_at: string;
  closed: boolean;
}

/** media.files — purpose verrouillé RF-PW05 (PORTFOLIO/BEFORE_AFTER, READY). */
export interface ShowcasePortfolioItem {
  id: string;
  url: string;
  media_type: string;
  purpose: string;
  width: number | null;
  height: number | null;
  sort_order: number;
}

export interface ShowcaseReputation {
  trust_score: number;
  trust_level: string;
  verification_level: number;
  completed_jobs: number;
  acceptance_rate: number | null;
  cancellation_rate: number | null;
  avg_response_min: number | null;
  punctuality_avg: number | null;
  avg_execution_days: number | null;
  disputes_count: number;
  seniority_days: number;
  ai_factor: number | null;
  recomputed_at: string;
}

/** Agrégat de lecture renvoyé par l'adaptateur (35 §5). */
export interface ProfessionalShowcaseView {
  profile: ShowcaseProfile | null;
  location: ShowcaseLocation | null;
  reputation: ShowcaseReputation | null;
  services: ShowcaseService[];
  business_hours: ShowcaseBusinessHour[];
  portfolio: ShowcasePortfolioItem[];
}

export interface ProfessionalShowcaseReadPort {
  /**
   * Vitrine complète d'un user (pros + media + geo, 35 §5).
   * null si le compte n'existe pas (jamais en pratique : sub validé par le guard).
   * `profile` null si aucun pros.profiles.
   */
  findByUserId(userId: string): Promise<ProfessionalShowcaseView | null>;
}

export const ProfessionalShowcaseReadPortToken =
  'ProfessionalShowcaseReadPort';