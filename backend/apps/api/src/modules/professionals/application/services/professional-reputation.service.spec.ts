import { UserRole } from '../../../auth/domain/entities/user-role';
import { UserStatus } from '../../../auth/domain/entities/user.entity';
import {
  AccountAnonymizedError,
  AccountLockedError,
  UserNotFoundError,
} from '../../../auth/domain/errors/auth-errors';
import { ProfessionalNotFoundError } from '../../domain/errors/professionals-errors';
import type {
  ProfessionalReputationOwnerView,
  ProfessionalReputationReadPort,
  ReputationMetrics,
} from '../ports/professional-reputation-read.port';
import { ProfessionalReputationService } from './professional-reputation.service';

const recomputedAt = new Date('2026-08-10T12:00:00.000Z');

const metrics = (overrides: Partial<ReputationMetrics> = {}): ReputationMetrics => ({
  trust_score: 4.25,
  trust_level: 'HIGH',
  verification_level: 2,
  completed_jobs: 12,
  acceptance_rate: 91.5,
  cancellation_rate: 2.5,
  avg_response_min: 8,
  punctuality_avg: 4.4,
  avg_execution_days: 2.75,
  disputes_count: 1,
  seniority_days: 420,
  recomputed_at: recomputedAt,
  ...overrides,
});

const ownerView = (
  overrides: Partial<ProfessionalReputationOwnerView['profile']> = {},
  reputation: ReputationMetrics | null = metrics(),
): ProfessionalReputationOwnerView => ({
  profile: {
    id: 'pro-1',
    role: UserRole.PROFESSIONAL,
    user_status: UserStatus.ACTIVE,
    professional_status: 'ACTIVE',
    anonymized_at: null,
    completed_jobs: 3,
    ...overrides,
  },
  reputation,
});

describe('ProfessionalReputationService', () => {
  const reader: jest.Mocked<ProfessionalReputationReadPort> = {
    findByUserId: jest.fn(),
  };
  const service = new ProfessionalReputationService(reader);

  beforeEach(() => jest.clearAllMocks());

  it('returns every persisted metric when the score is visible', async () => {
    reader.findByUserId.mockResolvedValue(ownerView());

    await expect(service.getMine('user-1')).resolves.toEqual({
      status: 'COMPUTED',
      score_visible: true,
      trust_score: 4.25,
      trust_level: 'HIGH',
      verification_level: 2,
      completed_jobs: 12,
      acceptance_rate: 91.5,
      cancellation_rate: 2.5,
      avg_response_min: 8,
      punctuality_avg: 4.4,
      avg_execution_days: 2.75,
      disputes_count: 1,
      seniority_days: 420,
      recomputed_at: recomputedAt,
    });
  });

  it('hides the score and forces NEW before five completed jobs', async () => {
    reader.findByUserId.mockResolvedValue(
      ownerView({}, metrics({ completed_jobs: 4, trust_level: 'EXCELLENT' })),
    );

    await expect(service.getMine('user-1')).resolves.toMatchObject({
      status: 'INSUFFICIENT_DATA',
      score_visible: false,
      trust_score: null,
      trust_level: 'NEW',
      completed_jobs: 4,
    });
  });

  it('returns a neutral response and the profile fallback when no row exists', async () => {
    reader.findByUserId.mockResolvedValue(ownerView({ completed_jobs: 3 }, null));

    await expect(service.getMine('user-1')).resolves.toEqual({
      status: 'NOT_COMPUTED',
      score_visible: false,
      trust_score: null,
      trust_level: 'NEW',
      verification_level: 0,
      completed_jobs: 3,
      acceptance_rate: null,
      cancellation_rate: null,
      avg_response_min: null,
      punctuality_avg: null,
      avg_execution_days: null,
      disputes_count: 0,
      seniority_days: 0,
      recomputed_at: null,
    });
  });

  it('preserves nullable persisted metrics', async () => {
    reader.findByUserId.mockResolvedValue(
      ownerView({}, metrics({
        acceptance_rate: null,
        cancellation_rate: null,
        avg_response_min: null,
        punctuality_avg: null,
        avg_execution_days: null,
      })),
    );

    const result = await service.getMine('user-1');
    expect(result.acceptance_rate).toBeNull();
    expect(result.cancellation_rate).toBeNull();
    expect(result.avg_response_min).toBeNull();
    expect(result.punctuality_avg).toBeNull();
    expect(result.avg_execution_days).toBeNull();
  });

  it.each([
    ['unknown user', null, UserNotFoundError],
    ['anonymized user', ownerView({ anonymized_at: recomputedAt }), AccountAnonymizedError],
    ['suspended user', ownerView({ user_status: UserStatus.SUSPENDED }), AccountLockedError],
    ['banned user', ownerView({ user_status: UserStatus.BANNED }), AccountLockedError],
    ['client role', ownerView({ role: UserRole.CLIENT }), ProfessionalNotFoundError],
    ['missing pro profile', ownerView({ id: null }), ProfessionalNotFoundError],
    ['suspended pro profile', ownerView({ professional_status: 'SUSPENDED' }), AccountLockedError],
  ])('rejects a %s', async (_label, view, error) => {
    reader.findByUserId.mockResolvedValue(view);
    await expect(service.getMine('user-1')).rejects.toBeInstanceOf(error);
  });

  it('performs exactly one read and no mutation', async () => {
    reader.findByUserId.mockResolvedValue(ownerView());
    await service.getMine('user-1');
    expect(reader.findByUserId).toHaveBeenCalledTimes(1);
    expect(reader.findByUserId).toHaveBeenCalledWith('user-1');
  });
});
