import { Inject, Injectable } from '@nestjs/common';
import { UserRole } from '../../../auth/domain/entities/user-role';
import { UserStatus } from '../../../auth/domain/entities/user.entity';
import {
  AccountAnonymizedError,
  AccountLockedError,
  UserNotFoundError,
} from '../../../auth/domain/errors/auth-errors';
import { ProfessionalNotFoundError } from '../../domain/errors/professionals-errors';
import {
  ProfessionalReputationReadPortToken,
} from '../ports/professional-reputation-read.port';
import type {
  ProfessionalReputationReadPort,
  ReputationMetrics,
} from '../ports/professional-reputation-read.port';

export type ReputationStatus =
  | 'NOT_COMPUTED'
  | 'INSUFFICIENT_DATA'
  | 'COMPUTED';

export interface ProfessionalReputationResponse {
  status: ReputationStatus;
  score_visible: boolean;
  trust_score: number | null;
  trust_level: 'NEW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCELLENT';
  verification_level: number;
  completed_jobs: number;
  acceptance_rate: number | null;
  cancellation_rate: number | null;
  avg_response_min: number | null;
  punctuality_avg: number | null;
  avg_execution_days: number | null;
  disputes_count: number;
  seniority_days: number;
  recomputed_at: Date | null;
}

const TRUST_LEVELS = new Set([
  'NEW',
  'LOW',
  'MEDIUM',
  'HIGH',
  'EXCELLENT',
]);

@Injectable()
export class ProfessionalReputationService {
  constructor(
    @Inject(ProfessionalReputationReadPortToken)
    private readonly reader: ProfessionalReputationReadPort,
  ) {}

  async getMine(userId: string): Promise<ProfessionalReputationResponse> {
    const view = await this.reader.findByUserId(userId);
    if (!view) throw new UserNotFoundError();
    const { profile, reputation } = view;
    if (profile.anonymized_at) throw new AccountAnonymizedError();
    if (
      profile.user_status === UserStatus.SUSPENDED ||
      profile.user_status === UserStatus.BANNED
    ) {
      throw new AccountLockedError();
    }
    if (profile.role !== UserRole.PROFESSIONAL || !profile.id) {
      throw new ProfessionalNotFoundError();
    }
    if (profile.professional_status === 'SUSPENDED') {
      throw new AccountLockedError();
    }
    if (!reputation) return this.notComputed(profile.completed_jobs);
    return this.computed(reputation);
  }

  private notComputed(completedJobs: number): ProfessionalReputationResponse {
    return {
      status: 'NOT_COMPUTED',
      score_visible: false,
      trust_score: null,
      trust_level: 'NEW',
      verification_level: 0,
      completed_jobs: completedJobs,
      acceptance_rate: null,
      cancellation_rate: null,
      avg_response_min: null,
      punctuality_avg: null,
      avg_execution_days: null,
      disputes_count: 0,
      seniority_days: 0,
      recomputed_at: null,
    };
  }

  private computed(rep: ReputationMetrics): ProfessionalReputationResponse {
    const visible = rep.completed_jobs >= 5;
    const level = visible && TRUST_LEVELS.has(rep.trust_level)
      ? rep.trust_level as ProfessionalReputationResponse['trust_level']
      : 'NEW';
    return {
      status: visible ? 'COMPUTED' : 'INSUFFICIENT_DATA',
      score_visible: visible,
      trust_score: visible ? rep.trust_score : null,
      trust_level: level,
      verification_level: rep.verification_level,
      completed_jobs: rep.completed_jobs,
      acceptance_rate: rep.acceptance_rate,
      cancellation_rate: rep.cancellation_rate,
      avg_response_min: rep.avg_response_min,
      punctuality_avg: rep.punctuality_avg,
      avg_execution_days: rep.avg_execution_days,
      disputes_count: rep.disputes_count,
      seniority_days: rep.seniority_days,
      recomputed_at: rep.recomputed_at,
    };
  }
}
