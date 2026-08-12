import type { RequestRepositoryPort, RequestView } from '../ports/request-repository.port';
import { RequestService } from './request.service';

const view = { id: '10000000-0000-4000-8000-000000000001' } as RequestView;
const dto = {
  category_id: '20000000-0000-4000-8000-000000000001',
  title: 'Besoin', description: 'Description', budget_min: 100,
  budget_max: 200, urgency: 'NORMAL',
  location: { division_id: '30000000-0000-4000-8000-000000000001' },
};

describe('RequestService', () => {
  const repo: jest.Mocked<RequestRepositoryPort> = {
    isActiveClient: jest.fn(), publish: jest.fn(), listMine: jest.fn(),
    findMine: jest.fn(), cancel: jest.fn(),
  };
  const service = new RequestService(repo);
  beforeEach(() => {
    jest.clearAllMocks();
    repo.isActiveClient.mockResolvedValue(true);
    repo.publish.mockResolvedValue(view);
  });

  it('normalise la publication et produit une empreinte stable', async () => {
    await service.publish('client-1', '40000000-0000-4000-8000-000000000001', dto);
    expect(repo.publish).toHaveBeenCalledWith('client-1', expect.objectContaining({
      title: 'Besoin', divisionId: dto.location.division_id,
      requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it.each([
    [{ ...dto, budget_min: 300 }, 'invalid_budget'],
    [{ ...dto, location: {} }, 'division_required'],
    [{ ...dto, location: { lat: 6.3 } }, 'coordinates_required_together'],
    [{ ...dto, desired_date: '2020-01-01T00:00:00Z' }, 'desired_date_in_past'],
  ])('rejette les règles métier invalides', async (body, code) => {
    await expect(service.publish('client-1', '40000000-0000-4000-8000-000000000001', body))
      .rejects.toMatchObject({ code });
  });

  it('impose un compte CLIENT actif', async () => {
    repo.isActiveClient.mockResolvedValue(false);
    await expect(service.publish('pro-1', '40000000-0000-4000-8000-000000000001', dto))
      .rejects.toMatchObject({ code: 'client_required' });
  });

  it('mappe les résultats idempotence, ownership et transitions', async () => {
    repo.publish.mockResolvedValue('IDEMPOTENCY_MISMATCH');
    await expect(service.publish('client-1', '40000000-0000-4000-8000-000000000001', dto))
      .rejects.toMatchObject({ code: 'idempotency_mismatch' });
    repo.findMine.mockResolvedValue(null);
    await expect(service.getMine('client-1', view.id)).rejects.toMatchObject({ code: 'request_not_found' });
    repo.cancel.mockResolvedValue('VERSION_CONFLICT');
    await expect(service.cancel('client-1', view.id, 'raison', 1)).rejects.toMatchObject({ code: 'version_conflict' });
    repo.cancel.mockResolvedValue('ILLEGAL_TRANSITION');
    await expect(service.cancel('client-1', view.id, 'raison', 1)).rejects.toMatchObject({ code: 'illegal_transition' });
  });
});
