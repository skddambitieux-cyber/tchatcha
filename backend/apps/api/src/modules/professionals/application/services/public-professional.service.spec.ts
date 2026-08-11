import { ProfessionalNotFoundError } from '../../domain/errors/professionals-errors';
import type {
  PublicProfessionalReadPort,
  PublicProfessionalView,
} from '../ports/public-professional-read.port';
import { PublicProfessionalService } from './public-professional.service';

describe('PublicProfessionalService', () => {
  const reader: jest.Mocked<PublicProfessionalReadPort> = { findById: jest.fn() };
  const service = new PublicProfessionalService(reader);

  beforeEach(() => jest.clearAllMocks());

  it('returns the dedicated public projection', async () => {
    const view = { id: 'pro-1', verified: false } as PublicProfessionalView;
    reader.findById.mockResolvedValue(view);
    await expect(service.getById('pro-1')).resolves.toBe(view);
  });

  it('uses the uniform public 404 when the reader rejects visibility', async () => {
    reader.findById.mockResolvedValue(null);
    await expect(service.getById('hidden')).rejects.toBeInstanceOf(
      ProfessionalNotFoundError,
    );
  });
});
