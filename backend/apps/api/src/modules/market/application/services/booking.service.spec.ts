import type {
  BookingRepositoryPort,
  BookingView,
} from '../ports/booking-repository.port';
import { BookingService } from './booking.service';
describe('BookingService', () => {
  const repo: jest.Mocked<BookingRepositoryPort> = {
    isActiveClient: jest.fn(),
    listSlots: jest.fn(),
    create: jest.fn(),
  };
  const service = new BookingService(repo);
  beforeEach(() => {
    jest.clearAllMocks();
    repo.isActiveClient.mockResolvedValue(true);
    repo.listSlots.mockResolvedValue([]);
  });
  it('rejette période invalide', async () => {
    await expect(
      service.slots('p', {
        from: '2026-08-20T00:00:00Z',
        to: '2026-08-19T00:00:00Z',
      }),
    ).rejects.toMatchObject({ code: 'invalid_slot_period' });
  });
  it('normalise idempotence et versions', async () => {
    repo.create.mockResolvedValue({ id: 'b' } as BookingView);
    await service.create('u', '10000000-0000-4000-8000-000000000001', {
      quote_id: '20000000-0000-4000-8000-000000000001',
      slot_id: '30000000-0000-4000-8000-000000000001',
      slot_version: 1,
      quote_version: 2,
      request_version: 3,
    });
    expect(repo.create).toHaveBeenCalledWith(
      'u',
      expect.objectContaining({
        requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });
  it.each([
    ['SLOT_CONFLICT', 'slot_conflict'],
    ['VERSION_CONFLICT', 'booking_version_conflict'],
    ['ILLEGAL_TRANSITION', 'booking_illegal_transition'],
  ] as const)('mappe %s', async (result, code) => {
    repo.create.mockResolvedValue(result);
    await expect(
      service.create('u', '10000000-0000-4000-8000-000000000001', {
        quote_id: '20000000-0000-4000-8000-000000000001',
        slot_id: '30000000-0000-4000-8000-000000000001',
        slot_version: 1,
        quote_version: 2,
        request_version: 3,
      }),
    ).rejects.toMatchObject({ code });
  });
});
