export interface ReputationOwnerProfile {
  id: string | null;
  role: string | null;
  user_status: string;
  professional_status: string | null;
  anonymized_at: Date | null;
  completed_jobs: number;
}

export interface ReputationMetrics {
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
  recomputed_at: Date;
}

export interface ProfessionalReputationOwnerView {
  profile: ReputationOwnerProfile;
  reputation: ReputationMetrics | null;
}

export interface ProfessionalReputationReadPort {
  findByUserId(userId: string): Promise<ProfessionalReputationOwnerView | null>;
}

export const ProfessionalReputationReadPortToken =
  'ProfessionalReputationReadPort';
