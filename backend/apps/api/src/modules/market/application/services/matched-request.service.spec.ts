import type { MatchedRequestRepositoryPort, MatchedRequestView } from '../ports/matched-request-repository.port';
import { MatchedRequestService } from './matched-request.service';

const first = {
  id: '10000000-0000-4000-8000-000000000002',
  created_at: '2026-08-12T10:00:00.000Z',
} as MatchedRequestView;
const second = {
  id: '10000000-0000-4000-8000-000000000001',
  created_at: '2026-08-12T09:00:00.000Z',
} as MatchedRequestView;

describe('MatchedRequestService', () => {
  const repository: jest.Mocked<MatchedRequestRepositoryPort> = {
    isPublishableProfessional: jest.fn(), listMatched: jest.fn(), findMatched: jest.fn(),
  };
  const service = new MatchedRequestService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.isPublishableProfessional.mockResolvedValue(true);
  });

  it('impose un profil professionnel publiable', async () => {
    repository.isPublishableProfessional.mockResolvedValue(false);
    await expect(service.list('user-1', 20)).rejects.toMatchObject({ code: 'professional_required' });
  });

  it('pagine par curseur opaque sans exposer la ligne sentinelle', async () => {
    repository.listMatched.mockResolvedValue([first, second]);
    const page = await service.list('user-1', 1);
    expect(page.items).toEqual([first]);
    expect(page.next_cursor).toEqual(expect.any(String));
    const decoded = JSON.parse(Buffer.from(page.next_cursor as string, 'base64url').toString());
    expect(decoded).toEqual({ createdAt: first.created_at, id: first.id });
    expect(repository.listMatched).toHaveBeenCalledWith('user-1', 2, undefined);
  });

  it('rejette un curseur invalide', async () => {
    await expect(service.list('user-1', 20, 'invalide')).rejects.toMatchObject({ code: 'invalid_cursor' });
  });

  it('retourne un 404 uniforme pour une demande non compatible', async () => {
    repository.findMatched.mockResolvedValue(null);
    await expect(service.detail('user-1', first.id)).rejects.toMatchObject({ code: 'request_not_found' });
  });
});
