/**
 * TCHATCHA — ProfessionalShowcaseService (6.3.3 + 6.3.4, docs/35 §5, docs/36 §5.2).
 * Lecture (getMe) + écritures de la vitrine pro : gardes RF-PW-W02/W03
 * mutualisées, version globale pros.profiles.version (RF-PW-W04b), validation
 * catégorie (RF-PW-W07) et horaires (RF-PW-W08), événement pros.profile.updated
 * uniquement après succès complet (RF-PW-W11), projection relue après écriture.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ProfessionalShowcaseReadPortToken,
} from '../ports/professional-showcase-read.port';
import type { ProfessionalShowcaseReadPort } from '../ports/professional-showcase-read.port';
import {
  ProfessionalShowcaseWritePortToken,
} from '../ports/professional-showcase-write.port';
import type {
  BusinessHourInput,
  LocationCommand,
  ProfessionalShowcaseWritePort,
  ServiceCommand,
  UpdateShowcaseCommand,
} from '../ports/professional-showcase-write.port';
import { ProfessionalEventPublisherPortToken } from '../ports/event-publisher.port';
import type { ProfessionalEventPublisherPort } from '../ports/event-publisher.port';
import {
  BusinessHoursInvalidError,
  CategoryNotAssignableError,
  CategoryNotFoundError,
  DivisionNotFoundError,
  ProfessionalNotFoundError,
  ServiceInvalidError,
} from '../../domain/errors/professionals-errors';
import {
  AccountAnonymizedError,
  AccountLockedError,
  UserNotFoundError,
  VersionConflictError,
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

const SERVICE_FIELDS = [
  'business_name',
  'headline',
  'description',
  'experience_years',
  'employees_count',
  'min_price',
  'website',
  'social_links',
];

@Injectable()
export class ProfessionalShowcaseService {
  constructor(
    @Inject(ProfessionalShowcaseReadPortToken)
    private readonly showcase: ProfessionalShowcaseReadPort,
    @Inject(ProfessionalShowcaseWritePortToken)
    private readonly writer: ProfessionalShowcaseWritePort,
    @Inject(ProfessionalEventPublisherPortToken)
    private readonly events: ProfessionalEventPublisherPort,
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

  /**
   * PUT /professionals/me (6.3.4, 36 RF-PW-W04). Verrouillage optimiste
   * (version), événement pros.profile.updated après succès, projection relue.
   */
  async updateMe(
    userId: string,
    cmd: UpdateShowcaseCommand,
  ): Promise<ProfessionalMeResponse> {
    const view = await this.assertWritable(userId);
    const ok = await this.writer.updateProfile(userId, cmd);
    if (!ok) {
      throw new VersionConflictError();
    }
    this.events.publish({
      type: 'pros.profile.updated',
      payload: {
        professional_id: view.profile.id,
        user_id: userId,
        version: cmd.expectedVersion + 1,
        fields: SERVICE_FIELDS,
      },
    });
    return this.getMe(userId);
  }

  /** POST /professionals/me/services (36 RF-PW-W05/W06/W07). */
  async createService(
    userId: string,
    cmd: ServiceCommand,
  ): Promise<ProfessionalMeResponse> {
    const view = await this.assertWritable(userId);
    await this.assertAssignableCategory(cmd.categoryId);
    this.assertServiceFields(cmd);
    const ok = await this.writer.createService(userId, cmd);
    if (!ok) {
      throw new VersionConflictError();
    }
    this.events.publish({
      type: 'pros.profile.updated',
      payload: {
        professional_id: view.profile.id,
        user_id: userId,
        version: cmd.expectedVersion + 1,
        fields: ['services'],
      },
    });
    return this.getMe(userId);
  }

  /** PUT /professionals/me/services/:id (36 RF-PW-W05/W06/W07). */
  async updateService(
    userId: string,
    serviceId: string,
    cmd: ServiceCommand,
  ): Promise<ProfessionalMeResponse> {
    const view = await this.assertWritable(userId);
    await this.assertAssignableCategory(cmd.categoryId);
    this.assertServiceFields(cmd);
    const ok = await this.writer.updateService(userId, serviceId, cmd);
    if (!ok) {
      throw new VersionConflictError();
    }
    this.events.publish({
      type: 'pros.profile.updated',
      payload: {
        professional_id: view.profile.id,
        user_id: userId,
        version: cmd.expectedVersion + 1,
        fields: ['services'],
      },
    });
    return this.getMe(userId);
  }

  /** DELETE /professionals/me/services/:id (36 RF-PW-W06b, sans promotion). */
  async deleteService(
    userId: string,
    serviceId: string,
    expectedVersion: number,
  ): Promise<ProfessionalMeResponse> {
    const view = await this.assertWritable(userId);
    const ok = await this.writer.deleteService(userId, serviceId, expectedVersion);
    if (!ok) {
      throw new VersionConflictError();
    }
    this.events.publish({
      type: 'pros.profile.updated',
      payload: {
        professional_id: view.profile.id,
        user_id: userId,
        version: expectedVersion + 1,
        fields: ['services'],
      },
    });
    return this.getMe(userId);
  }

  /** PUT /professionals/me/business_hours (36 RF-PW-W08) — remplacement atomique. */
  async replaceBusinessHours(
    userId: string,
    items: BusinessHourInput[],
    expectedVersion: number,
  ): Promise<ProfessionalMeResponse> {
    const view = await this.assertWritable(userId);
    this.assertBusinessHours(items);
    const ok = await this.writer.replaceBusinessHours(
      userId,
      items,
      expectedVersion,
    );
    if (!ok) {
      throw new VersionConflictError();
    }
    this.events.publish({
      type: 'pros.profile.updated',
      payload: {
        professional_id: view.profile.id,
        user_id: userId,
        version: expectedVersion + 1,
        fields: ['business_hours'],
      },
    });
    return this.getMe(userId);
  }

  /** PUT /professionals/me/location (36 RF-PW-W09) — upsert 1:1. */
  async upsertLocation(
    userId: string,
    cmd: LocationCommand,
  ): Promise<ProfessionalMeResponse> {
    const view = await this.assertWritable(userId);
    if (cmd.divisionId && !(await this.writer.divisionExists(cmd.divisionId))) {
      throw new DivisionNotFoundError();
    }
    const ok = await this.writer.upsertLocation(userId, cmd);
    if (!ok) {
      throw new VersionConflictError();
    }
    this.events.publish({
      type: 'pros.profile.updated',
      payload: {
        professional_id: view.profile.id,
        user_id: userId,
        version: cmd.expectedVersion + 1,
        fields: ['location'],
      },
    });
    return this.getMe(userId);
  }

  /** Gardes RF-PW-W02/W03 (404/403), retourne le view pour la projection. */
  private async assertWritable(
    userId: string,
  ): Promise<NonNullable<Awaited<ReturnType<ProfessionalShowcaseReadPort['findByUserId']>>>> {
    const view = await this.showcase.findByUserId(userId);
    if (!view) {
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
    if (profile.role !== UserRole.PROFESSIONAL || !profile.id) {
      throw new ProfessionalNotFoundError();
    }
    if (profile.status === 'SUSPENDED') {
      throw new AccountLockedError();
    }
    return view;
  }

  /** RF-PW-W07 : catégorie feuille (parent_id non null) + active. */
  private async assertAssignableCategory(categoryId: string): Promise<void> {
    const category = await this.writer.categoryById(categoryId);
    if (!category) {
      throw new CategoryNotFoundError();
    }
    if (!category.parentId || !category.active) {
      throw new CategoryNotAssignableError();
    }
  }

  /** RF-PW-W05 : prix cohérents (price_to >= price_from). */
  private assertServiceFields(cmd: ServiceCommand): void {
    if (
      cmd.priceFrom != null &&
      cmd.priceTo != null &&
      cmd.priceTo < cmd.priceFrom
    ) {
      throw new ServiceInvalidError();
    }
  }

  /** RF-PW-W08 : ≤ 7 lignes, weekday unique 1-7, close > open. */
  private assertBusinessHours(items: BusinessHourInput[]): void {
    if (items.length > 7) {
      throw new BusinessHoursInvalidError();
    }
    const seen = new Set<number>();
    for (const item of items) {
      if (item.weekday < 1 || item.weekday > 7 || seen.has(item.weekday)) {
        throw new BusinessHoursInvalidError();
      }
      seen.add(item.weekday);
      if (item.closeAt <= item.openAt) {
        throw new BusinessHoursInvalidError();
      }
    }
  }
}
