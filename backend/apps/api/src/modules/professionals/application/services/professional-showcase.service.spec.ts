/**
 * Tests unitaires ProfessionalShowcaseService — docs/35 §6 (6.3.3) +
 * docs/36 §6 (6.3.4). Ports mockés (read + write + events) : mapping,
 * gardes RF-PW02/03, écritures (version globale W04b, catégorie W07,
 * horaires W08, événement W11).
 */
import { Test } from '@nestjs/testing';
import {
  ProfessionalShowcaseReadPort,
  ProfessionalShowcaseReadPortToken,
  ProfessionalShowcaseView,
} from '../ports/professional-showcase-read.port';
import {
  ProfessionalShowcaseWritePort,
  ProfessionalShowcaseWritePortToken,
} from '../ports/professional-showcase-write.port';
import { ProfessionalEventPublisherPortToken } from '../ports/event-publisher.port';
import { MediaFileService } from '../../../media/application/media-file.service';
import { ProfessionalShowcaseService } from './professional-showcase.service';
import {
  BusinessHoursInvalidError,
  CategoryNotAssignableError,
  CategoryNotFoundError,
  DivisionNotFoundError,
  ProfessionalNotFoundError,
  ServiceInvalidError,
  ServiceNotFoundError,
} from '../../domain/errors/professionals-errors';
import {
  AccountAnonymizedError,
  AccountLockedError,
  UserNotFoundError,
  VersionConflictError,
} from '../../../auth/domain/errors/auth-errors';

const BASE_PROFILE = {
  id: 'prof-1' as string,
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

function makeView(
  profileOverrides: Partial<typeof BASE_PROFILE> = {},
  overrides: Partial<ProfessionalShowcaseView> = {},
): ProfessionalShowcaseView {
  const profile = profileOverrides.id
    ? { ...BASE_PROFILE, ...profileOverrides }
    : { ...BASE_PROFILE, ...profileOverrides };
  return {
    profile,
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

const WRITE_COMMAND = {
  businessName: 'Plomberie SOS',
  headline: 'Plombier 15 ans',
  description: 'Dépannage rapide',
  experienceYears: 15,
  employeesCount: 3,
  minPrice: 5000,
  website: 'https://plomberie-sos.bj',
  socialLinks: { whatsapp: '22900000000' },
  expectedVersion: 1,
};

const SERVICE_COMMAND = {
  categoryId: 'cat-1',
  title: 'Dépannage urgent',
  description: 'Intervention 24 h',
  priceFrom: 5000,
  priceTo: 15000,
  priceUnit: 'PER_JOB',
  isPrimary: true,
  sortOrder: 0,
  expectedVersion: 1,
};

describe('ProfessionalShowcaseService — docs 35 §6 (6.3.3)', () => {
  let service: ProfessionalShowcaseService;
  let findByUserId: jest.Mock;

  beforeEach(async () => {
    findByUserId = jest.fn();

    const fakePort: ProfessionalShowcaseReadPort = {
      findByUserId,
      findPortfolio: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfessionalShowcaseService,
        { provide: ProfessionalShowcaseReadPortToken, useValue: fakePort },
        {
          provide: ProfessionalShowcaseWritePortToken,
          useValue: {
            updateProfile: jest.fn(),
            createService: jest.fn(),
            updateService: jest.fn(),
            deleteService: jest.fn(),
            replaceBusinessHours: jest.fn(),
            upsertLocation: jest.fn(),
            categoryById: jest.fn(),
            divisionExists: jest.fn(),
            confirmPortfolioItem: jest.fn(),
            updatePortfolioItem: jest.fn(),
            deletePortfolioItem: jest.fn(),
          },
        },
        {
          provide: ProfessionalEventPublisherPortToken,
          useValue: { publish: jest.fn() },
        },
        {
          provide: MediaFileService,
          useValue: {
            verifyForConfirm: jest.fn(),
            deleteObject: jest.fn(),
          },
        },
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
      makeView({}, { location: null, reputation: null, services: [], business_hours: [], portfolio: [] }),
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
      makeView(
        {},
        {
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
        },
      ),
    );
    const me = await service.getMe('user-1');
    expect(me.location?.location_name).toBe('Rue des Artisans');
  });

  it('role ≠ PROFESSIONAL → ProfessionalNotFoundError (RF-PW02)', async () => {
    findByUserId.mockResolvedValue(
      makeView(
        { role: 'CLIENT' },
        { location: null, reputation: null, services: [], business_hours: [], portfolio: [] },
      ),
    );
    await expect(service.getMe('user-1')).rejects.toThrow(
      ProfessionalNotFoundError,
    );
  });

  it('rôle PRO mais fiche absente → ProfessionalNotFoundError (RF-PW02)', async () => {
    findByUserId.mockResolvedValue(
      makeView(
        { id: undefined },
        { location: null, reputation: null, services: [], business_hours: [], portfolio: [] },
      ),
    );
    await expect(service.getMe('user-1')).rejects.toThrow(
      ProfessionalNotFoundError,
    );
  });

  it('compte SUSPENDED → AccountLockedError (RF-PW03)', async () => {
    findByUserId.mockResolvedValue(makeView({ user_status: 'SUSPENDED' }));
    await expect(service.getMe('user-1')).rejects.toThrow(AccountLockedError);
  });

  it('compte BANNED → AccountLockedError (RF-PW03)', async () => {
    findByUserId.mockResolvedValue(makeView({ user_status: 'BANNED' }));
    await expect(service.getMe('user-1')).rejects.toThrow(AccountLockedError);
  });

  it('compte anonymisé → AccountAnonymizedError (RF-PW03)', async () => {
    findByUserId.mockResolvedValue(
      makeView({ anonymized_at: new Date('2026-08-08T00:00:00.000Z') }),
    );
    await expect(service.getMe('user-1')).rejects.toThrow(
      AccountAnonymizedError,
    );
  });

  it('fiche SUSPENDED → AccountLockedError (RF-PW03, SCR-011)', async () => {
    findByUserId.mockResolvedValue(makeView({ status: 'SUSPENDED' }));
    await expect(service.getMe('user-1')).rejects.toThrow(AccountLockedError);
  });

  it('compte inconnu (view null) → UserNotFoundError (pas de fuite)', async () => {
    findByUserId.mockResolvedValue(null);
    await expect(service.getMe('inconnu')).rejects.toThrow(UserNotFoundError);
  });
});

describe('ProfessionalShowcaseService — docs 36 §6 (6.3.4, écritures)', () => {
  let service: ProfessionalShowcaseService;
  let findByUserId: jest.Mock;
  let writer: {
    updateProfile: jest.Mock;
    createService: jest.Mock;
    updateService: jest.Mock;
    deleteService: jest.Mock;
    replaceBusinessHours: jest.Mock;
    upsertLocation: jest.Mock;
    categoryById: jest.Mock;
    divisionExists: jest.Mock;
  };
  let publish: jest.Mock;

  beforeEach(async () => {
    findByUserId = jest.fn();
    writer = {
      updateProfile: jest.fn(),
      createService: jest.fn(),
      updateService: jest.fn(),
      deleteService: jest.fn(),
      replaceBusinessHours: jest.fn(),
      upsertLocation: jest.fn(),
      categoryById: jest.fn(),
      divisionExists: jest.fn(),
    };
    publish = jest.fn();

    const fakeRead: ProfessionalShowcaseReadPort = {
      findByUserId,
      findPortfolio: jest.fn(),
    };
    const fakeWrite = writer as unknown as ProfessionalShowcaseWritePort;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfessionalShowcaseService,
        { provide: ProfessionalShowcaseReadPortToken, useValue: fakeRead },
        { provide: ProfessionalShowcaseWritePortToken, useValue: fakeWrite },
        {
          provide: ProfessionalEventPublisherPortToken,
          useValue: { publish },
        },
        {
          provide: MediaFileService,
          useValue: {
            verifyForConfirm: jest.fn(),
            deleteObject: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ProfessionalShowcaseService);
  });

  it('updateMe OK → écriture avec expectedVersion, événement, projection relue', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.updateProfile.mockResolvedValue(true);

    const me = await service.updateMe('user-1', WRITE_COMMAND);

    expect(writer.updateProfile).toHaveBeenCalledWith('user-1', WRITE_COMMAND);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pros.profile.updated',
        payload: expect.objectContaining({
          professional_id: 'prof-1',
          user_id: 'user-1',
          version: 2,
        }),
      }),
    );
    expect(me.business_name).toBe('Plomberie SOS');
  });

  it('updateMe version obsolète → VersionConflictError, pas d’événement', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.updateProfile.mockResolvedValue(false);

    await expect(
      service.updateMe('user-1', WRITE_COMMAND),
    ).rejects.toThrow(VersionConflictError);
    expect(publish).not.toHaveBeenCalled();
  });

  it('updateMe non-PRO → ProfessionalNotFoundError, writer jamais appelé', async () => {
    findByUserId.mockResolvedValue(
      makeView({ role: 'CLIENT' }, { location: null, reputation: null, services: [], business_hours: [], portfolio: [] }),
    );

    await expect(
      service.updateMe('user-1', WRITE_COMMAND),
    ).rejects.toThrow(ProfessionalNotFoundError);
    expect(writer.updateProfile).not.toHaveBeenCalled();
  });

  it('createService catégorie inconnue → CategoryNotFoundError (RF-PW-W07)', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.categoryById.mockResolvedValue(null);

    await expect(
      service.createService('user-1', SERVICE_COMMAND),
    ).rejects.toThrow(CategoryNotFoundError);
    expect(writer.createService).not.toHaveBeenCalled();
  });

  it('createService catégorie racine → CategoryNotAssignableError (CAT-001)', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.categoryById.mockResolvedValue({
      id: 'cat-root',
      parentId: null,
      active: true,
    });

    await expect(
      service.createService('user-1', SERVICE_COMMAND),
    ).rejects.toThrow(CategoryNotAssignableError);
  });

  it('createService catégorie inactive → CategoryNotAssignableError (CAT-002)', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.categoryById.mockResolvedValue({
      id: 'cat-1',
      parentId: 'cat-root',
      active: false,
    });

    await expect(
      service.createService('user-1', SERVICE_COMMAND),
    ).rejects.toThrow(CategoryNotAssignableError);
  });

  it('createService price_to < price_from → ServiceInvalidError (RF-PW-W05)', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.categoryById.mockResolvedValue({
      id: 'cat-1',
      parentId: 'cat-root',
      active: true,
    });

    await expect(
      service.createService('user-1', {
        ...SERVICE_COMMAND,
        priceFrom: 10000,
        priceTo: 5000,
      }),
    ).rejects.toThrow(ServiceInvalidError);
  });

  it('createService OK → événement services + projection', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.categoryById.mockResolvedValue({
      id: 'cat-1',
      parentId: 'cat-root',
      active: true,
    });
    writer.createService.mockResolvedValue(true);

    const me = await service.createService('user-1', SERVICE_COMMAND);

    expect(writer.createService).toHaveBeenCalledWith('user-1', SERVICE_COMMAND);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ fields: ['services'] }),
      }),
    );
    expect(me.version).toBe(1);
  });

  it('updateService service absent → ServiceNotFoundError propagé', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.categoryById.mockResolvedValue({
      id: 'cat-1',
      parentId: 'cat-root',
      active: true,
    });
    writer.updateService.mockRejectedValue(new ServiceNotFoundError());

    await expect(
      service.updateService('user-1', 'svc-999', SERVICE_COMMAND),
    ).rejects.toThrow(ServiceNotFoundError);
    expect(publish).not.toHaveBeenCalled();
  });

  it('deleteService OK → événement, version = expected + 1', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.deleteService.mockResolvedValue(true);

    await service.deleteService('user-1', 'svc-1', 1);

    expect(writer.deleteService).toHaveBeenCalledWith('user-1', 'svc-1', 1);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          version: 2,
          fields: ['services'],
        }),
      }),
    );
  });

  it('deleteService version obsolète → VersionConflictError', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.deleteService.mockResolvedValue(false);

    await expect(
      service.deleteService('user-1', 'svc-1', 1),
    ).rejects.toThrow(VersionConflictError);
    expect(publish).not.toHaveBeenCalled();
  });

  it('replaceBusinessHours weekday doublon → BusinessHoursInvalidError (W08)', async () => {
    findByUserId.mockResolvedValue(makeView());

    await expect(
      service.replaceBusinessHours(
        'user-1',
        [
          { weekday: 1, openAt: '08:00:00', closeAt: '18:00:00', closed: false },
          { weekday: 1, openAt: '10:00:00', closeAt: '12:00:00', closed: false },
        ],
        1,
      ),
    ).rejects.toThrow(BusinessHoursInvalidError);
    expect(writer.replaceBusinessHours).not.toHaveBeenCalled();
  });

  it('replaceBusinessHours close ≤ open → BusinessHoursInvalidError (W08)', async () => {
    findByUserId.mockResolvedValue(makeView());

    await expect(
      service.replaceBusinessHours(
        'user-1',
        [{ weekday: 1, openAt: '18:00:00', closeAt: '08:00:00', closed: false }],
        1,
      ),
    ).rejects.toThrow(BusinessHoursInvalidError);
  });

  it('replaceBusinessHours > 7 lignes → BusinessHoursInvalidError (W08)', async () => {
    findByUserId.mockResolvedValue(makeView());
    const hours = Array.from({ length: 8 }, (_, i) => ({
      weekday: i + 1,
      openAt: '08:00:00',
      closeAt: '18:00:00',
      closed: false,
    }));

    await expect(
      service.replaceBusinessHours('user-1', hours, 1),
    ).rejects.toThrow(BusinessHoursInvalidError);
  });

  it('replaceBusinessHours OK → appel writer + événement business_hours', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.replaceBusinessHours.mockResolvedValue(true);
    const hours = [
      { weekday: 1, openAt: '08:00:00', closeAt: '18:00:00', closed: false },
      { weekday: 6, openAt: '10:00:00', closeAt: '14:00:00', closed: true },
    ];

    await service.replaceBusinessHours('user-1', hours, 1);

    expect(writer.replaceBusinessHours).toHaveBeenCalledWith('user-1', hours, 1);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ fields: ['business_hours'] }),
      }),
    );
  });

  it('upsertLocation division inexistante → DivisionNotFoundError (RF-PW-W09)', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.divisionExists.mockResolvedValue(false);

    await expect(
      service.upsertLocation('user-1', {
        lat: 6.4,
        lon: 2.35,
        divisionId: 'div-999',
        serviceRadiusKm: 10,
        addressText: 'Calavi',
        expectedVersion: 1,
      }),
    ).rejects.toThrow(DivisionNotFoundError);
    expect(writer.upsertLocation).not.toHaveBeenCalled();
  });

  it('upsertLocation OK (sans division) → événement location', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.upsertLocation.mockResolvedValue(true);

    await service.upsertLocation('user-1', {
      lat: 6.4,
      lon: 2.35,
      divisionId: null,
      serviceRadiusKm: 10,
      addressText: 'Calavi',
      expectedVersion: 1,
    });

    expect(writer.upsertLocation).toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ fields: ['location'] }),
      }),
    );
  });
});

describe('ProfessionalShowcaseService — docs 37 §6 (6.3.5a, portfolio)', () => {
  let service: ProfessionalShowcaseService;
  let findByUserId: jest.Mock;
  let findPortfolio: jest.Mock;
  let writer: {
    confirmPortfolioItem: jest.Mock;
    updatePortfolioItem: jest.Mock;
    deletePortfolioItem: jest.Mock;
  };
  let publish: jest.Mock;
  let media: { verifyForConfirm: jest.Mock; deleteObject: jest.Mock };

  const PORTFOLIO_CMD = {
    sortOrder: 1,
    purpose: 'BEFORE_AFTER',
    expectedVersion: 1,
  };

  beforeEach(async () => {
    findByUserId = jest.fn();
    findPortfolio = jest.fn();
    writer = {
      confirmPortfolioItem: jest.fn(),
      updatePortfolioItem: jest.fn(),
      deletePortfolioItem: jest.fn(),
    };
    publish = jest.fn();
    media = { verifyForConfirm: jest.fn(), deleteObject: jest.fn() };

    const fakeRead: ProfessionalShowcaseReadPort = { findByUserId, findPortfolio };
    const fakeWrite = writer as unknown as ProfessionalShowcaseWritePort;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfessionalShowcaseService,
        { provide: ProfessionalShowcaseReadPortToken, useValue: fakeRead },
        { provide: ProfessionalShowcaseWritePortToken, useValue: fakeWrite },
        { provide: ProfessionalEventPublisherPortToken, useValue: { publish } },
        { provide: MediaFileService, useValue: media },
      ],
    }).compile();

    service = moduleRef.get(ProfessionalShowcaseService);
  });

  it('confirmPortfolio OK → writer bumpé + événement portfolio (version + 1)', async () => {
    findByUserId.mockResolvedValue(makeView());
    media.verifyForConfirm.mockResolvedValue({ id: 'media-1' });
    writer.confirmPortfolioItem.mockResolvedValue(true);

    await service.confirmPortfolio('user-1', 'media-1', 1);

    expect(writer.confirmPortfolioItem).toHaveBeenCalledWith('user-1', 'media-1', 1);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ version: 2, fields: ['portfolio'] }),
      }),
    );
  });

  it('confirmPortfolio version obsolète → VersionConflictError, pas d’événement', async () => {
    findByUserId.mockResolvedValue(makeView());
    media.verifyForConfirm.mockResolvedValue({ id: 'media-1' });
    writer.confirmPortfolioItem.mockResolvedValue(false);

    await expect(
      service.confirmPortfolio('user-1', 'media-1', 1),
    ).rejects.toThrow(VersionConflictError);
    expect(publish).not.toHaveBeenCalled();
  });

  it('confirmPortfolio garde media en échec → propagée, pas d’écriture', async () => {
    findByUserId.mockResolvedValue(makeView());
    media.verifyForConfirm.mockRejectedValue(new Error('410'));
    await expect(
      service.confirmPortfolio('user-1', 'media-1', 1),
    ).rejects.toThrow('410');
    expect(writer.confirmPortfolioItem).not.toHaveBeenCalled();
  });

  it('updatePortfolio OK → événement portfolio', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.updatePortfolioItem.mockResolvedValue(true);

    await service.updatePortfolio('user-1', 'media-1', PORTFOLIO_CMD);

    expect(writer.updatePortfolioItem).toHaveBeenCalledWith(
      'user-1',
      'media-1',
      PORTFOLIO_CMD,
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ version: 2, fields: ['portfolio'] }),
      }),
    );
  });

  it('updatePortfolio version obsolète → VersionConflictError', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.updatePortfolioItem.mockResolvedValue(false);

    await expect(
      service.updatePortfolio('user-1', 'media-1', PORTFOLIO_CMD),
    ).rejects.toThrow(VersionConflictError);
  });

  it('deletePortfolio OK → objet S3 supprimé + événement', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.deletePortfolioItem.mockResolvedValue({
      s3Key: 'BJ/PROFESSIONAL/prof-1/a.jpg',
    });

    await service.deletePortfolio('user-1', 'media-1', 1);

    expect(media.deleteObject).toHaveBeenCalledWith(
      'BJ/PROFESSIONAL/prof-1/a.jpg',
      'public',
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ version: 2, fields: ['portfolio'] }),
      }),
    );
  });

  it('deletePortfolio échec suppression S3 → silencieux, événement quand même', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.deletePortfolioItem.mockResolvedValue({ s3Key: 'k' });
    media.deleteObject.mockRejectedValue(new Error('réseau'));

    await expect(service.deletePortfolio('user-1', 'media-1', 1)).resolves.toBeDefined();
    expect(publish).toHaveBeenCalled();
  });

  it('deletePortfolio version obsolète → VersionConflictError, pas de suppression S3', async () => {
    findByUserId.mockResolvedValue(makeView());
    writer.deletePortfolioItem.mockResolvedValue(null);

    await expect(
      service.deletePortfolio('user-1', 'media-1', 1),
    ).rejects.toThrow(VersionConflictError);
    expect(media.deleteObject).not.toHaveBeenCalled();
  });

  it('listPortfolio → pagination déléguée au reader', async () => {
    findByUserId.mockResolvedValue(makeView());
    findPortfolio.mockResolvedValue({
      items: [],
      page: 2,
      limit: 10,
      total: 0,
    });

    const page = await service.listPortfolio('user-1', 2, 10);

    expect(findPortfolio).toHaveBeenCalledWith('user-1', 2, 10);
    expect(page.page).toBe(2);
  });

  it('listPortfolio compte interdit → AccountLockedError', async () => {
    findByUserId.mockResolvedValue(makeView({ status: 'SUSPENDED' }));

    await expect(service.listPortfolio('user-1', 1, 10)).rejects.toThrow(
      AccountLockedError,
    );
    expect(findPortfolio).not.toHaveBeenCalled();
  });
});
