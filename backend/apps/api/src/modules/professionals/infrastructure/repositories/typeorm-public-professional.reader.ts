import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  PublicProfessionalReadPort,
  PublicProfessionalView,
} from '../../application/ports/public-professional-read.port';

@Injectable()
export class TypeOrmPublicProfessionalReader implements PublicProfessionalReadPort {
  constructor(private readonly dataSource: DataSource) {}

  async findById(id: string): Promise<PublicProfessionalView | null> {
    const profiles = await this.dataSource.query(
      `SELECT p.id, p.business_name, p.headline, p.description,
              p.experience_years, p.employees_count, p.verified,
              p.rating_avg, p.rating_count, p.completed_jobs, p.min_price,
              p.currency, p.website, p.social_links, p.country_code
         FROM pros.profiles p
         JOIN users.users u ON u.id = p.user_id
        WHERE p.id = $1
          AND search.is_professional_publishable(p.id)
        LIMIT 1`,
      [id],
    );
    const profile = profiles[0];
    if (!profile) return null;

    const [services, hours, portfolio, locations, reputations] = await Promise.all([
      this.dataSource.query(
        `SELECT s.id, s.category_id, c.name AS category_name, c.slug,
                s.title, s.description, s.price_from, s.price_to,
                s.price_unit, s.is_primary, s.sort_order
           FROM pros.services s
           LEFT JOIN pros.categories c ON c.id = s.category_id
          WHERE s.professional_id = $1 AND s.deleted_at IS NULL
          ORDER BY s.sort_order, s.created_at, s.id`,
        [id],
      ),
      this.dataSource.query(
        `SELECT weekday, open_at, close_at, closed
           FROM pros.business_hours
          WHERE professional_id = $1 ORDER BY weekday`,
        [id],
      ),
      this.dataSource.query(
        `SELECT id, url, media_type, purpose, width, height, sort_order
           FROM media.files
          WHERE owner_type = 'PROFESSIONAL' AND owner_id = $1
            AND purpose IN ('PORTFOLIO', 'BEFORE_AFTER')
            AND status = 'READY' AND deleted_at IS NULL
          ORDER BY sort_order, created_at, id`,
        [id],
      ),
      this.dataSource.query(
        `SELECT l.country_code, l.division_id, d.name AS division_name,
                l.service_radius_km
           FROM pros.locations l
           LEFT JOIN geo.divisions d ON d.id = l.division_id AND d.active = true
          WHERE l.professional_id = $1 LIMIT 1`,
        [id],
      ),
      this.dataSource.query(
        `SELECT trust_score, trust_level, completed_jobs
           FROM pros.reputation WHERE professional_id = $1 LIMIT 1`,
        [id],
      ),
    ]);

    const reputation = reputations[0];
    const completedJobs = reputation
      ? Number(reputation.completed_jobs)
      : Number(profile.completed_jobs);
    const scoreVisible = completedJobs >= 5;

    return {
      id: profile.id,
      business_name: profile.business_name,
      headline: profile.headline,
      description: profile.description,
      experience_years: profile.experience_years,
      employees_count: profile.employees_count,
      verified: Boolean(profile.verified),
      rating_avg: Number(profile.rating_avg),
      rating_count: Number(profile.rating_count),
      completed_jobs: Number(profile.completed_jobs),
      min_price: profile.min_price != null ? Number(profile.min_price) : null,
      currency: profile.currency,
      website: profile.website,
      social_links: profile.social_links ?? null,
      country_code: profile.country_code,
      services: services.map((row: Record<string, unknown>) => ({
        ...row,
        price_from: row.price_from != null ? Number(row.price_from) : null,
        price_to: row.price_to != null ? Number(row.price_to) : null,
        is_primary: Boolean(row.is_primary),
        sort_order: Number(row.sort_order),
      })),
      business_hours: hours.map((row: Record<string, unknown>) => ({
        weekday: Number(row.weekday),
        open_at: row.open_at,
        close_at: row.close_at,
        closed: Boolean(row.closed),
      })),
      portfolio: portfolio.map((row: Record<string, unknown>) => ({
        ...row,
        width: row.width != null ? Number(row.width) : null,
        height: row.height != null ? Number(row.height) : null,
        sort_order: Number(row.sort_order),
      })),
      location: locations[0]
        ? {
            country_code: locations[0].country_code,
            division_id: locations[0].division_id ?? null,
            division_name: locations[0].division_name ?? null,
            location_name: locations[0].division_name ?? null,
            service_radius_km: Number(locations[0].service_radius_km),
          }
        : null,
      reputation: {
        score_visible: scoreVisible,
        trust_score: scoreVisible && reputation ? Number(reputation.trust_score) : null,
        trust_level: scoreVisible && reputation ? reputation.trust_level : 'NEW',
        completed_jobs: completedJobs,
      },
    };
  }
}
