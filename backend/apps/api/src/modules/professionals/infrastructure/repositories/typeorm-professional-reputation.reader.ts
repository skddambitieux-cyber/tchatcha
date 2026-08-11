import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  ProfessionalReputationOwnerView,
  ProfessionalReputationReadPort,
  ReputationMetrics,
} from '../../application/ports/professional-reputation-read.port';

interface ReputationRow {
  professional_id: string | null;
  role: string | null;
  user_status: string;
  professional_status: string | null;
  anonymized_at: Date | null;
  profile_completed_jobs: number | string | null;
  reputation_exists: boolean;
  trust_score: number | string | null;
  trust_level: string | null;
  verification_level: number | string | null;
  reputation_completed_jobs: number | string | null;
  acceptance_rate: number | string | null;
  cancellation_rate: number | string | null;
  avg_response_min: number | string | null;
  punctuality_avg: number | string | null;
  avg_execution_days: number | string | null;
  disputes_count: number | string | null;
  seniority_days: number | string | null;
  recomputed_at: Date | null;
}

@Injectable()
export class TypeOrmProfessionalReputationReader
  implements ProfessionalReputationReadPort
{
  constructor(private readonly dataSource: DataSource) {}

  async findByUserId(
    userId: string,
  ): Promise<ProfessionalReputationOwnerView | null> {
    const rows = await this.dataSource.query<ReputationRow[]>(
      `SELECT p.id AS professional_id,
              ur.role,
              u.status AS user_status,
              p.status AS professional_status,
              u.anonymized_at,
              p.completed_jobs AS profile_completed_jobs,
              (r.professional_id IS NOT NULL) AS reputation_exists,
              r.trust_score,
              r.trust_level,
              r.verification_level,
              r.completed_jobs AS reputation_completed_jobs,
              r.acceptance_rate,
              r.cancellation_rate,
              r.avg_response_min,
              r.punctuality_avg,
              r.avg_execution_days,
              r.disputes_count,
              r.seniority_days,
              r.recomputed_at
         FROM users.users u
         LEFT JOIN users.user_roles ur ON ur.user_id = u.id
         LEFT JOIN pros.profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
         LEFT JOIN pros.reputation r ON r.professional_id = p.id
        WHERE u.id = $1 AND u.deleted_at IS NULL
        LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      profile: {
        id: row.professional_id,
        role: row.role,
        user_status: row.user_status,
        professional_status: row.professional_status,
        anonymized_at: row.anonymized_at ? new Date(row.anonymized_at) : null,
        completed_jobs: Number(row.profile_completed_jobs ?? 0),
      },
      reputation: row.reputation_exists ? this.toMetrics(row) : null,
    };
  }

  private toMetrics(row: ReputationRow): ReputationMetrics {
    return {
      trust_score: Number(row.trust_score ?? 0),
      trust_level: row.trust_level ?? 'NEW',
      verification_level: Number(row.verification_level ?? 0),
      completed_jobs: Number(row.reputation_completed_jobs ?? 0),
      acceptance_rate:
        row.acceptance_rate == null ? null : Number(row.acceptance_rate),
      cancellation_rate:
        row.cancellation_rate == null ? null : Number(row.cancellation_rate),
      avg_response_min:
        row.avg_response_min == null ? null : Number(row.avg_response_min),
      punctuality_avg:
        row.punctuality_avg == null ? null : Number(row.punctuality_avg),
      avg_execution_days:
        row.avg_execution_days == null
          ? null
          : Number(row.avg_execution_days),
      disputes_count: Number(row.disputes_count ?? 0),
      seniority_days: Number(row.seniority_days ?? 0),
      recomputed_at: new Date(row.recomputed_at as Date),
    };
  }
}
