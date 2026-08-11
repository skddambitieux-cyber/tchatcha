import { AdminVerificationService } from './admin-verification.service';

const pending = { id: 'v1', professional_id: 'p1', type: 'NATIONAL_ID', media_id: 'm1',
  mime_type: 'application/pdf', status: 'PENDING', reviewed_by: null, reviewed_at: null,
  note: null, created_at: new Date('2026-01-01') };

describe('AdminVerificationService', () => {
  it('présigne les documents privés de la file', async () => {
    const repo = { list: jest.fn().mockResolvedValue({ items: [{ ...pending, business_name: 'Pro', s3_key: 'BJ/doc.pdf' }], total: 1 }) };
    const storage = { presignRead: jest.fn().mockResolvedValue({ url: 'signed', expiresIn: 900 }) };
    const service = new AdminVerificationService(repo as never, storage as never, {} as never);
    const out = await service.list('PENDING', 1, 50);
    expect(out.items[0].documents[0].url).toBe('signed');
    expect(storage.presignRead).toHaveBeenCalledWith({ key: 'BJ/doc.pdf', bucket: 'private' });
  });

  it('refuse un rejet sans motif avant le repository', async () => {
    const repo = { decide: jest.fn() };
    const service = new AdminVerificationService(repo as never, {} as never, {} as never);
    await expect(service.decide('v1', 'a1', false, ' ')).rejects.toMatchObject({ code: 'missing_reason' });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it('publie les deux événements après une décision réussie', async () => {
    const approved = { ...pending, status: 'APPROVED' };
    const repo = { decide: jest.fn().mockResolvedValue({ professionalId: 'p1', professionalUserId: 'u1', verification: approved, dossier: [approved], level: 1 }) };
    const events = { publish: jest.fn() };
    const projection = { rebuild: jest.fn() };
    const service = new AdminVerificationService(repo as never, {} as never, events as never, projection as never);
    await service.decide('v1', 'a1', true);
    expect(events.publish).toHaveBeenCalledTimes(2);
    expect(projection.rebuild).toHaveBeenCalledWith('p1');
  });

  it.each([['NOT_FOUND', 'verification_not_found'], ['INVALID_STATE', 'verification_pending']])(
    'mappe %s', async (result, code) => {
      const service = new AdminVerificationService({ decide: jest.fn().mockResolvedValue(result) } as never, {} as never, {} as never);
      await expect(service.decide('v1', 'a1', true)).rejects.toMatchObject({ code });
    });
});
