import type { VerificationRecord } from '../../../professionals/application/ports/professional-verification-repository.port';

export interface AdminVerificationItem extends VerificationRecord {
  business_name: string;
  s3_key: string;
}

export interface DecisionResult {
  professionalUserId: string;
  professionalId: string;
  verification: VerificationRecord;
  dossier: VerificationRecord[];
  level: number;
}

export interface AdminVerificationRepository {
  list(status: string, page: number, limit: number): Promise<{ items: AdminVerificationItem[]; total: number }>;
  decide(id: string, adminId: string, approve: boolean, reason: string | null): Promise<DecisionResult | 'NOT_FOUND' | 'INVALID_STATE'>;
}

export const AdminVerificationRepositoryToken = 'AdminVerificationRepository';
