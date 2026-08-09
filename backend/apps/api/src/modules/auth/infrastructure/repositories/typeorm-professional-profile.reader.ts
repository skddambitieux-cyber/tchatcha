/**
 * TCHATCHA — Adapter TypeORM du port local ProfessionalProfileReadPort (D-ME-2).
 * Mappe localement `pros.profiles` + `pros.locations` + `geo.divisions` et/ou
 * `address_text` (location_name, 31 §1) **sans importer** les classes du module
 * professionals : projet audité par le DataSource, isolation de module (D-PORT-1).
 */
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ProfessionalProfileReadPort,
  ProfessionalProfileView,
} from '../../application/ports/professional-profile-read.port';

interface ProfileRow {
  id: string;
  business_name: string | null;
  status: string;
  verified: boolean;
  verified_at: Date | null;
  rating_avg: number;
  rating_count: number;
  trust_score: number;
  completed_jobs: number;
  location_name: string | null;
}

@Injectable()
export class TypeOrmProfessionalProfileReader implements ProfessionalProfileReadPort {
  constructor(private readonly dataSource: DataSource) {}

  async findByUserId(userId: string): Promise<ProfessionalProfileView | null> {
    const rows = await this.dataSource.query<ProfileRow[]>(
      `SELECT p.id,
              p.business_name,
              p.status,
              p.verified,
              p.verified_at,
              p.rating_avg,
              p.rating_count,
              p.trust_score,
              p.completed_jobs,
              COALESCE(d.name, l.address_text) AS location_name
         FROM pros.profiles p
         LEFT JOIN pros.locations l ON l.professional_id = p.id
         LEFT JOIN geo.divisions d   ON d.id = l.division_id
        WHERE p.user_id = $1
        LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      business_name: row.business_name,
      status: row.status,
      verified: row.verified,
      verified_at: row.verified_at ? new Date(row.verified_at) : null,
      rating_avg: Number(row.rating_avg),
      rating_count: Number(row.rating_count),
      trust_score: Number(row.trust_score),
      completed_jobs: Number(row.completed_jobs),
      location_name: row.location_name ?? null,
    };
  }
}