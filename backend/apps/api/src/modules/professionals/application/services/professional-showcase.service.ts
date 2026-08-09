/**
 * TCHATCHA — ProfessionalShowcaseService (6.3.3, docs/35 §5).
 * Lecture de la vitrine pro du propriétaire authentifié. Application des
 * règles verrouillées RF-PW02/03 (404 non-PRO / 403), assemblage de la
 * réponse. Pure : aucun événement, aucune écriture (RF-PW08).
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ProfessionalShowcaseReadPort,
  ProfessionalShowcaseReadPortToken,
} from '../ports/professional-showcase-read.port';
import { ProfessionalNotFoundError } from '../../domain/errors/professionals-errors';
import {
  AccountAnonymizedError,
  AccountLockedError,
  UserNotFoundError,
} from '../../../auth/domain/errors/auth-errors';
import { UserRole } from '../../../auth/domain/entities/user-role';
import { UserStatus } from '../../../auth/domain/entities/user.entity';

/** Réponse GET /professionals/me (35 §4). */
export interface ProfessionalMeResponse {
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
  verified_at: string | null;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  min_price: number | null;
  currency: string;
  website: string | null;
  social_links: Record<string, string> | null;
  location: {
    country_code: string;
    division_id: string | null;
    division_name: string | null;
    location_name: string | null;
    lat: number | null;
    lon: number | null;
    service_radius_km: number;
    address_text: string | null;
  } | null;
  services: {
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
  }[];
  business_hours: {
    weekday: number;
    open_at: string;
    close_at: string;
    closed: boolean;
  }[];
  portfolio: {
    id: string;
    url: string;
    media_type: string;
    purpose: string;
    width: number | null;
    height: number | null;
    sort_order: number;
  }[];
  reputation: {
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
  } | null;
}

@Injectable()
export class ProfessionalShowcaseService {
  constructor(
    @Inject(ProfessionalShowcaseReadPortToken)
    private readonly showcase: ProfessionalShowcaseReadPort,
  ) {}

  async getMe(userId: string): Promise<ProfessionalMeResponse> {
    const view = await this.showcase.findByUserId(userId);
    if (!view) {
      // sub validé par le guard → jamais en pratique ; 401, pas de fuite.
      throw new UserNotFoundError();
    }
    const { profile } = view;
    if (profile.anonymized_at) {
      throw new AccountAnonymizedError();
    }
    if (
      profile.user_status === UserStatus.SUSPENDED ||
      profile.user_status === UserStatus.BANNED
    ) {
      throw new AccountLockedError();
    }
    // RF-PW02 : 404 contractuel — non-PRO ou fiche absente, jamais de dévoilement.
    if (profile.role !== UserRole.PROFESSIONAL || !profile.id) {
      throw new ProfessionalNotFoundError();
    }
    // RF-PW03 : fiche suspendue → fiche inaccessible (SCR-011, BR-031).
    if (profile.status === 'SUSPENDED') {
      throw new AccountLockedError();
    }

    return {
      id: profile.id,
      user_id: profile.user_id,
      version: profile.version,
      business_name: profile.business_name,
      headline: profile.headline,
      description: profile.description,
      experience_years: profile.experience_years,
      employees_count: profile.employees_count,
      status: profile.status,
      verified: profile.verified,
      verified_at: profile.verified_at?.toISOString() ?? null,
      rating_avg: profile.rating_avg,
      rating_count: profile.rating_count,
      completed_jobs: profile.completed_jobs,
      min_price: profile.min_price,
      currency: profile.currency,
      website: profile.website,
      social_links: profile.social_links ?? null,
      location: view.location,
      services: view.services.map((s) => ({
        id: s.id,
        category_id: s.category_id,
        category_name: s.category_name,
        slug: s.slug,
        title: s.title,
        description: s.description,
        price_from: s.price_from,
        price_to: s.price_to,
        price_unit: s.price_unit,
        is_primary: s.is_primary,
        sort_order: s.sort_order,
      })),
      business_hours: view.business_hours,
      portfolio: view.portfolio,
      reputation: view.reputation,
    };
  }
}