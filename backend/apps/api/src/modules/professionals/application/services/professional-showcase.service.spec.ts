/**
 * Tests unitaires ProfessionalShowcaseService — docs/35 §6 (lot 6.3.3).
 * Faux ProfessionalShowcaseReadPort (port mocké) : mapping, règles
 * RF-PW02/03 (404 non-PRO, 403), fiche minimale, filtre portfolio.
 */
import { Test } from '@nestjs/testing';
import {
  ProfessionalShowcaseReadPort,
  ProfessionalShowcaseReadPortToken,
  ProfessionalShowcaseView,
} from '../ports/professional-showcase-read.port';
import { ProfessionalShowcaseService } from './professional-showcase.service';
import { ProfessionalNotFoundError } from '../../domain/errors/professionals-errors';
import {
  AccountAnonymizedError,
  AccountLockedError,
  UserNotFoundError,
} from '../../../auth/domain/errors/auth-errors';

const BASE_PROFILE = {
  id: 'prof-1',
  user_id: 'user-1',
  version: 1,
  business_name: 'Plomberie SOS',
  headline: 'Plombier 15 ans',
  description: 'Dépannage rapide',
  experience_years: 15,
  employees_count: 3,
  status: 'ACTIVE',
  verified: true,
  verified_at: new Date('2026-08-07T08:05:00.000Z'),
  rating_avg: 4.5,
  rating_count: 12,
  completed_jobs: 34,
  min_price: 5000,
  currency: 'XOF',
  website: 'https://plomberie-sos.bj',
  social_links: { whatsapp: '22900000000' },
  user_status: 'ACTIVE',
  anonymized_at: null,
  role: 'PROFESSIONAL',
};

function makeView(overrides: Partial<ProfessionalShowcaseView> = {}) {
  return {
    profile: { ...BASE_PROFILE },
    location: {
      country_code: 'BJ',
      division_id: 'div-1',
      division_name: 'Abomey-Calavi',
      location_name: 'Abomey-Calavi',
      lat: 6.438544,
      lon: 2.350294,
      service_radius_km: 10,
      address_text: 'Carré 123, Calavi',
    },
    reputation: {
      trust_score: 0.82,
      trust_level: 'TRUSTED',
      verification_level: 2,
      completed_jobs: 34,
      acceptance_rate: 95,
      cancellation_rate: 2,
      avg_response_min: 12,
      punctuality_avg: 4.7,
      avg_execution_days: 3,
      disputes_count: 0,
      seniority_days: 1200,
      ai_factor: 0.5,
      recomputed_at: '2026-08-07T00:00:00.000Z',
    },
    services: [
      {
        id: 'svc-1',
        category_id: 'cat-1',
        category_name: 'Plomberie',
        slug: 'plomberie',
        title: 'Dépannage urgent',
        description: 'Intervention 24 h',
        price_from: 5000,
        price_to: 15000,
        price_unit: 'PER_JOB',
        is_primary: true,
        sort_order: 0,
      },
    ],
    business_hours: [
      { weekday: 1, open_at: '08:00:00', close_at: '18:00:00', closed: false },
    ],
    portfolio: [
      {
        id: 'media-1',
        url: 'https://cdn.example/p1.jpg',
        media_type: 'IMAGE',
        purpose: 'PORTFOLIO',
        width: 1200,
        height: 900,
        sort_order: 0,
      },
    ],
    ...overrides,
  };
}

describe('ProfessionalShowcaseService.getMe — docs 35 §6 (lot 6.3.3)', () => {
  let service: ProfessionalShowcaseService;
  let findByUserId: jest.Mock;

  beforeEach(async () => {
    findByUserId = jest.fn();

    const fakePort: ProfessionalShowcaseReadPort = { findByUserId };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfessionalShowcaseService,
        { provide: ProfessionalShowcaseReadPortToken, useValue: fakePort },
      ],
    }).compile();

    service = moduleRef.get(ProfessionalShowcaseService);
  });

  it('PRO complet → fiche complète (toutes sections, badge, reporté tel quel)', async () => {
    findByUserId.mockResolvedValue(makeView());
    const me = await service.getMe('user-1');

    expect(me).toMatchObject({
      id: 'prof-1',
      business_name: 'Plomberie SOS',
      verified: true,
      status: 'ACTIVE',
      location: expect.objectContaining({
        location_name: 'Abomey-Calavi',
        lat: 6.438544,
        lon: 2.350294,
      }),
      reputation: expect.objectContaining({ trust_score: 0.82 }),
    });
    expect(me.services).toHaveLength(1);
    expect(me.business_hours).toHaveLength(1);
    expect(me.portfolio).toHaveLength(1);
    expect(me.portfolio[0].purpose).toBe('PORTFOLIO');
  });

  it('fiche minimale (aucun extra) → lists vides, nulls apaisés (RF-PW06)', async () => {
    findByUserId.mockResolvedValue(
      makeView({
        location: null,
        reputation: null,
        services: [],
        business_hours: [],
        portfolio: [],
      }),
    );
    const me = await service.getMe('user-1');
    expect(me.location).toBeNull();
    expect(me.reputation).toBeNull();
    expect(me.services).toEqual([]);
    expect(me.business_hours).toEqual([]);
    expect(me.portfolio).toEqual([]);
  });

  it('location_name = division_name sinon address_text (RF-PW04)', async () => {
    findByUserId.mockResolvedValue(
      makeView({
        location: {
          country_code: 'BJ',
          division_id: null,
          division_name: null,
          location_name: 'Rue des Artisans',
          lat: null,
          lon: null,
          service_radius_km: 5,
          address_text: 'Rue des Artisans',
        },
      }),
    );
    const me = await service.getMe('user-1');
    expect(me.location?.location_name).toBe('Rue des Artisans');
  });

  it('role ≠ PROFESSIONAL → ProfessionalNotFoundError (RF-PW02)', async () => {
    findByUserId.mockResolvedValue(
      makeView({
        profile: { ...BASE_PROFILE, role: 'CLIENT', id: undefined },
        services: [],
        business_hours: [],
        portfolio: [],
        location: null,
        reputation: null,
      }),
    );
    await expect(service.getMe('user-1')).rejects.toThrow(
      ProfessionalNotFoundError,
    );
  });

  it('rôle PRO mais fiche absente → ProfessionalNotFoundError (RF-PW02)', async () => {
    findByUserId.mockResolvedValue(
      makeView({
        profile: { ...BASE_PROFILE, id: undefined },
        services: [],
        business_hours: [],
        portfolio: [],
      }),
    );
    await expect(service.getMe('user-1')).rejects.toThrow(
      ProfessionalNotFoundError,
    );
  });

  it('compte SUSPENDED → AccountLockedError (RF-PW03)', async () => {
    findByUserId.mockResolvedValue(
      makeView({
        profile: { ...BASE_PROFILE, user_status: 'SUSPENDED' },
      }),
    );
    await expect(service.getMe('user-1')).rejects.toThrow(AccountLockedError);
  });

  it('compte BANNED → AccountLockedError (RF-PW03)', async () => {
    findByUserId.mockResolvedValue(
      makeView({
        profile: { ...BASE_PROFILE, user_status: 'BANNED' },
      }),
    );
    await expect(service.getMe('user-1')).rejects.toThrow(AccountLockedError);
  });

  it('compte anonymisé → AccountAnonymizedError (RF-PW03)', async () => {
    findByUserId.mockResolvedValue(
      makeView({
        profile: {
          ...BASE_PROFILE,
          anonymized_at: new Date('2026-08-08T00:00:00.000Z'),
        },
      }),
    );
    await expect(service.getMe('user-1')).rejects.toThrow(
      AccountAnonymizedError,
    );
  });

  it('fiche SUSPENDED → AccountLockedError (RF-PW03, SCR-011)', async () => {
    findByUserId.mockResolvedValue(
      makeView({
        profile: { ...BASE_PROFILE, status: 'SUSPENDED' },
      }),
    );
    await expect(service.getMe('user-1')).rejects.toThrow(AccountLockedError);
  });

  it('compte inconnu (view null) → UserNotFoundError (pas de fuite)', async () => {
    findByUserId.mockResolvedValue(null);
    await expect(service.getMe('inconnu')).rejects.toThrow(UserNotFoundError);
  });
});