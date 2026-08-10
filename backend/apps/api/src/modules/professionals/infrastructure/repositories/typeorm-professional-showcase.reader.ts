/**
 * TCHATCHA — Adapter TypeORM de ProfessionalShowcaseReadPort (6.3.3, 35 §5).
 * Lecture verrouillée RF-PW04/PW05/PW07/PW09 : 4 requêtes indexées max,
 * location_name = geo.divisions.name sinon address_text sinon null, portfolio
 * limité à purpose PORTFOLIO/BEFORE_AFTER + status READY, point en degrés 6
 * décimales via ST_Y/ST_X. Aucune écriture.
 */
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PortfolioPage,
  PortfolioPageItem,
  ProfessionalShowcaseReadPort,
  ProfessionalShowcaseView,
  ShowcaseBusinessHour,
  ShowcaseLocation,
  ShowcasePortfolioItem,
  ShowcaseProfile,
  ShowcaseReputation,
  ShowcaseService,
} from '../../application/ports/professional-showcase-read.port';

interface ProfileRow {
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
  user_status: string;
  anonymized_at: Date | null;
  role: string | null;
}

@Injectable()
export class TypeOrmProfessionalShowcaseReader
  implements ProfessionalShowcaseReadPort
{
  constructor(private readonly dataSource: DataSource) {}

  async findByUserId(
    userId: string,
  ): Promise<ProfessionalShowcaseView | null> {
    const profile = await this.readProfile(userId);
    if (!profile) {
      return null;
    }
    const [services, hours, portfolio, location, reputation] =
      await Promise.all([
        this.readServices(userId),
        this.readBusinessHours(userId),
        this.readPortfolio(userId),
        this.readLocation(userId),
        this.readReputation(userId),
      ]);
    return {
      profile,
      services,
      business_hours: hours,
      portfolio,
      location,
      reputation,
    };
  }

  /** ① compte + pros.profiles (joins 1:1, RF-PW09). */
  private async readProfile(userId: string): Promise<ShowcaseProfile | null> {
    const rows = await this.dataSource.query<ProfileRow[]>(
      `SELECT p.id,
              p.user_id,
              p.version,
              p.business_name,
              p.headline,
              p.description,
              p.experience_years,
              p.employees_count,
              p.status,
              p.verified,
              p.verified_at,
              p.rating_avg,
              p.rating_count,
              p.completed_jobs,
              p.min_price,
              p.currency,
              p.website,
              p.social_links,
              u.status        AS user_status,
              u.anonymized_at AS anonymized_at,
              r.role          AS role
         FROM users.users u
         LEFT JOIN pros.profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
         LEFT JOIN users.user_roles r ON r.user_id = u.id
        WHERE u.id = $1
          AND u.deleted_at IS NULL
        LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      user_id: row.user_id,
      version: row.version,
      business_name: row.business_name,
      headline: row.headline,
      description: row.description,
      experience_years: row.experience_years,
      employees_count: row.employees_count,
      status: row.status,
      verified: row.verified,
      verified_at: row.verified_at ? new Date(row.verified_at) : null,
      rating_avg: Number(row.rating_avg),
      rating_count: Number(row.rating_count),
      completed_jobs: Number(row.completed_jobs),
      min_price: row.min_price != null ? Number(row.min_price) : null,
      currency: row.currency,
      website: row.website,
      social_links: row.social_links ?? null,
      user_status: row.user_status,
      anonymized_at: row.anonymized_at ? new Date(row.anonymized_at) : null,
      role: row.role ?? null,
    };
  }

  /** ② pros.services + pros.categories, tri sort_order/created_at (RF-PW09). */
  private async readServices(userId: string): Promise<ShowcaseService[]> {
    const rows = await this.dataSource.query(
      `SELECT s.id,
              s.category_id,
              c.name AS category_name,
              c.slug AS slug,
              s.title,
              s.description,
              s.price_from,
              s.price_to,
              s.price_unit,
              s.is_primary,
              s.sort_order
         FROM pros.services s
         LEFT JOIN pros.categories c ON c.id = s.category_id
        WHERE s.professional_id = (
                SELECT id FROM pros.profiles WHERE user_id = $1
              )
          AND s.deleted_at IS NULL
        ORDER BY s.sort_order ASC, s.created_at ASC`,
      [userId],
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      category_id: r.category_id,
      category_name: r.category_name ?? null,
      slug: r.slug ?? null,
      title: r.title,
      description: r.description ?? null,
      price_from: r.price_from != null ? Number(r.price_from) : null,
      price_to: r.price_to != null ? Number(r.price_to) : null,
      price_unit: r.price_unit ?? null,
      is_primary: Boolean(r.is_primary),
      sort_order: Number(r.sort_order),
    }));
  }

  /** ③ pros.business_hours, tri weekday (RF-PW09). */
  private async readBusinessHours(
    userId: string,
  ): Promise<ShowcaseBusinessHour[]> {
    const rows = await this.dataSource.query(
      `SELECT weekday, open_at, close_at, closed
         FROM pros.business_hours
        WHERE professional_id = (
                SELECT id FROM pros.profiles WHERE user_id = $1
              )
        ORDER BY weekday ASC`,
      [userId],
    );
    return rows.map((r: Record<string, unknown>) => ({
      weekday: Number(r.weekday),
      open_at: String(r.open_at),
      close_at: String(r.close_at),
      closed: Boolean(r.closed),
    }));
  }

  /** ④ media.files — purpose verrouillé RF-PW05, READY seulement (RF-PW09). */
  private async readPortfolio(userId: string): Promise<ShowcasePortfolioItem[]> {
    const rows = await this.dataSource.query(
      `SELECT id, url, media_type, purpose, width, height, sort_order
         FROM media.files
        WHERE owner_type = 'PROFESSIONAL'
          AND owner_id = (
                SELECT id FROM pros.profiles WHERE user_id = $1
              )
          AND purpose IN ('PORTFOLIO', 'BEFORE_AFTER')
          AND status = 'READY'
          AND deleted_at IS NULL
        ORDER BY sort_order ASC, created_at ASC`,
      [userId],
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      url: r.url,
      media_type: r.media_type,
      purpose: r.purpose,
      width: r.width != null ? Number(r.width) : null,
      height: r.height != null ? Number(r.height) : null,
      sort_order: Number(r.sort_order),
    }));
  }

  /** GET /professionals/me/portfolio (37 RF-PW-P04) — pagination offset. */
  async findPortfolio(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PortfolioPage> {
    const ownerSql = `(SELECT id FROM pros.profiles WHERE user_id = $1)`;
    const whereSql = `owner_type = 'PROFESSIONAL'
          AND owner_id = ${ownerSql}
          AND purpose IN ('PORTFOLIO', 'BEFORE_AFTER')
          AND status = 'READY'
          AND deleted_at IS NULL`;
    const totalRows = await this.dataSource.query(
      `SELECT count(*)::int AS n FROM media.files WHERE ${whereSql}`,
      [userId],
    );
    const total = Number(totalRows[0].n);
    const offset = (page - 1) * limit;
    const rows = await this.dataSource.query(
      `SELECT id, url, media_type, purpose, mime_type, size_bytes,
              width, height, duration_sec, sort_order, created_at
         FROM media.files
        WHERE ${whereSql}
        ORDER BY sort_order ASC, created_at ASC, id ASC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    const items: PortfolioPageItem[] = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      url: r.url,
      media_type: r.media_type,
      purpose: r.purpose,
      mime_type: r.mime_type,
      size_bytes: Number(r.size_bytes),
      width: r.width != null ? Number(r.width) : null,
      height: r.height != null ? Number(r.height) : null,
      duration_sec: r.duration_sec != null ? Number(r.duration_sec) : null,
      sort_order: Number(r.sort_order),
      created_at: new Date(r.created_at as string).toISOString(),
    }));
    return { items, page, limit, total };
  }

  /** pros.locations + geo.divisions — point en degrés, 6 décimales (RF-PW07). */
  private async readLocation(userId: string): Promise<ShowcaseLocation | null> {
    const rows = await this.dataSource.query(
      `SELECT l.country_code,
              l.division_id,
              d.name            AS division_name,
              COALESCE(d.name, l.address_text) AS location_name,
              ROUND(ST_Y(l.location)::numeric, 6) AS lat,
              ROUND(ST_X(l.location)::numeric, 6) AS lon,
              l.service_radius_km,
              l.address_text
         FROM pros.locations l
         LEFT JOIN geo.divisions d ON d.id = l.division_id
        WHERE l.professional_id = (
                SELECT id FROM pros.profiles WHERE user_id = $1
              )
        LIMIT 1`,
      [userId],
    );
    const r = rows[0];
    if (!r) {
      return null;
    }
    return {
      country_code: r.country_code,
      division_id: r.division_id ?? null,
      division_name: r.division_name ?? null,
      location_name: r.location_name ?? null,
      lat: r.lat != null ? Number(r.lat) : null,
      lon: r.lon != null ? Number(r.lon) : null,
      service_radius_km: Number(r.service_radius_km),
      address_text: r.address_text ?? null,
    };
  }

  /** pros.reputation — nullable (06d §2). */
  private async readReputation(
    userId: string,
  ): Promise<ShowcaseReputation | null> {
    const rows = await this.dataSource.query(
      `SELECT trust_score,
              trust_level,
              verification_level,
              completed_jobs,
              acceptance_rate,
              cancellation_rate,
              avg_response_min,
              punctuality_avg,
              avg_execution_days,
              disputes_count,
              seniority_days,
              ai_factor,
              recomputed_at
         FROM pros.reputation
        WHERE professional_id = (
                SELECT id FROM pros.profiles WHERE user_id = $1
              )
        LIMIT 1`,
      [userId],
    );
    const r = rows[0];
    if (!r) {
      return null;
    }
    return {
      trust_score: Number(r.trust_score),
      trust_level: r.trust_level,
      verification_level: Number(r.verification_level),
      completed_jobs: Number(r.completed_jobs),
      acceptance_rate: r.acceptance_rate != null ? Number(r.acceptance_rate) : null,
      cancellation_rate:
        r.cancellation_rate != null ? Number(r.cancellation_rate) : null,
      avg_response_min:
        r.avg_response_min != null ? Number(r.avg_response_min) : null,
      punctuality_avg:
        r.punctuality_avg != null ? Number(r.punctuality_avg) : null,
      avg_execution_days:
        r.avg_execution_days != null ? Number(r.avg_execution_days) : null,
      disputes_count: Number(r.disputes_count),
      seniority_days: Number(r.seniority_days),
      ai_factor: r.ai_factor != null ? Number(r.ai_factor) : null,
      recomputed_at: new Date(r.recomputed_at).toISOString(),
    };
  }
}