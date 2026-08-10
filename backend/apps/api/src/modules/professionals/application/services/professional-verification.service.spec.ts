/**
 * Tests unitaires ProfessionalVerificationService — docs/38 §4.2 (6.3.5b-1).
 * Gardes pro (404/403), whitelist des types, ownership media (confirmDocument),
 * anti-réutilisation, transitions PENDING/APPROVED/REJECTED (réactivation),
 * événement pros.verification.submitted, projection GET dossier (RF-VR-06).
 */
import { Test } from '@nestjs/testing';
import { ProfessionalShowcaseReadPortToken } from '../ports/professional-showcase-read.port';
import { ProfessionalEventPublisherPortToken } from '../ports/event-publisher.port';
import { ProfessionalVerificationRepositoryToken } from '../ports/professional-verification-repository.port';
import { MediaFileService } from '../../../media/application/media-file.service';
import {
  AccountAnonymizedError,
  AccountLockedError,
  UserNotFoundError,
} from '../../../auth/domain/errors/auth-errors';
import { ProfessionalNotFoundError } from '../../domain/errors/professionals-errors';
import {
  DocumentAlreadyUsedError,
  VerificationAlreadyApprovedError,
  VerificationPendingError,
  VerificationTypeNotSupportedError,
} from '../../domain/errors/professionals-errors';
import { MediaNotFoundError } from '../../../media/domain/errors/media-errors';
import { ProfessionalVerificationService } from './professional-verification.service';

const VIEW = {
  profile: {
    id: 'prof-1',
    user_id: 'user-1',
    version: 1,
    business_name: 'Plomberie SOS',
    headline: null,
    description: null,
    experience_years: null,
    employees_count: null,
    status: 'ACTIVE',
    verified: false,
    verified_at: null,
    rating_avg: 0,
    rating_count: 0,
    completed_jobs: 0,
    min_price: null,
    currency: 'XOF',
    website: null,
    social_links: null,
    user_status: 'ACTIVE',
    anonymized_at: null,
    role: 'PROFESSIONAL',
  },
  location: null,
  reputation: null,
  services: [],
  business_hours: [],
  portfolio: [],
};

const VERIFICATION = {
  id: 'ver-1',
  professional_id: 'prof-1',
  type: 'NATIONAL_ID',
  media_id: 'media-1',
  mime_type: 'image/jpeg',
  status: 'PENDING',
  reviewed_by: null,
  reviewed_at: null,
  note: null,
  created_at: new Date('2026-08-10T10:00:00.000Z'),
};

describe('ProfessionalVerificationService — docs 38 §4.2 (6.3.5b-1)', () => {
  let service: ProfessionalVerificationService;
  let findByUserId: jest.Mock;
  let confirmDocument: jest.Mock;
  let repo: {
    findByType: jest.Mock;
    listByProfessional: jest.Mock;
    isMediaReferenced: jest.Mock;
    createPending: jest.Mock;
    reactivateRejected: jest.Mock;
  };
  let events: { publish: jest.Mock };

  beforeEach(async () => {
    findByUserId = jest.fn().mockResolvedValue(VIEW);
    confirmDocument = jest.fn().mockResolvedValue({ ...VERIFICATION, status: 'READY' });
    events = { publish: jest.fn() };
    repo = {
      findByType: jest.fn().mockResolvedValue(null),
      listByProfessional: jest.fn().mockResolvedValue([]),
      isMediaReferenced: jest.fn().mockResolvedValue(false),
      createPending: jest.fn().mockResolvedValue(VERIFICATION),
      reactivateRejected: jest.fn().mockResolvedValue(true),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfessionalVerificationService,
        {
          provide: ProfessionalShowcaseReadPortToken,
          useValue: { findByUserId },
        },
        {
          provide: ProfessionalVerificationRepositoryToken,
          useValue: repo,
        },
        {
          provide: ProfessionalEventPublisherPortToken,
          useValue: events,
        },
        {
          provide: MediaFileService,
          useValue: { confirmDocument },
        },
      ],
    }).compile();

    service = moduleRef.get(ProfessionalVerificationService);
  });

  describe('submit (RF-VR-03/04/05/07)', () => {
    it('succès nominal → createPending + tâche admin (côté repo) + événement', async () => {
      const result = await service.submit('user-1', [
        { type: 'NATIONAL_ID', media_id: 'media-1' },
      ]);

      expect(confirmDocument).toHaveBeenCalledWith('user-1', 'media-1');
      expect(repo.isMediaReferenced).toHaveBeenCalledWith('media-1');
      expect(repo.createPending).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'NATIONAL_ID',
        mediaId: 'media-1',
      });
      expect(result.verifications).toEqual([
        expect.objectContaining({ id: 'ver-1', status: 'PENDING', type: 'NATIONAL_ID' }),
      ]);
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'pros.verification.submitted' }),
      );
    });

    it('type inconnu → 422 verification_type_not_supported', async () => {
      await expect(
        service.submit('user-1', [{ type: 'CARTE_CONSULAIRE', media_id: 'media-1' }]),
      ).rejects.toBeInstanceOf(VerificationTypeNotSupportedError);
      expect(repo.createPending).not.toHaveBeenCalled();
    });

    it('média inconnu/d’un autre pro → 404 (confirmDocument)', async () => {
      confirmDocument.mockRejectedValue(new MediaNotFoundError());
      await expect(
        service.submit('user-1', [{ type: 'NATIONAL_ID', media_id: 'media-9' }]),
      ).rejects.toBeInstanceOf(MediaNotFoundError);
    });

    it('document déjà référencé → 422 document_already_used', async () => {
      repo.isMediaReferenced.mockResolvedValue(true);
      await expect(
        service.submit('user-1', [{ type: 'NATIONAL_ID', media_id: 'media-1' }]),
      ).rejects.toBeInstanceOf(DocumentAlreadyUsedError);
      expect(repo.createPending).not.toHaveBeenCalled();
    });

    it('NATIONAL_ID déjà PENDING → 409 verification_pending', async () => {
      repo.findByType.mockResolvedValue(VERIFICATION);
      await expect(
        service.submit('user-1', [{ type: 'NATIONAL_ID', media_id: 'media-2' }]),
      ).rejects.toBeInstanceOf(VerificationPendingError);
      expect(repo.createPending).not.toHaveBeenCalled();
    });

    it('SELFIE déjà APPROVED → 409 verification_already_approved', async () => {
      repo.findByType.mockResolvedValue({ ...VERIFICATION, status: 'APPROVED' });
      await expect(
        service.submit('user-1', [{ type: 'SELFIE', media_id: 'media-2' }]),
      ).rejects.toBeInstanceOf(VerificationAlreadyApprovedError);
    });

    it('ligne REJECTED → réactivation (nouveau média, PENDING, tâche admin)', async () => {
      repo.findByType.mockResolvedValue({ ...VERIFICATION, status: 'REJECTED' });
      const result = await service.submit('user-1', [
        { type: 'NATIONAL_ID', media_id: 'media-2' },
      ]);

      expect(repo.reactivateRejected).toHaveBeenCalledWith(
        'user-1',
        'ver-1',
        'media-2',
      );
      expect(repo.createPending).not.toHaveBeenCalled();
      expect(result.verifications[0]).toEqual(
        expect.objectContaining({ id: 'ver-1', status: 'PENDING' }),
      );
    });

    it('PRO_DOCUMENT : lignes multiples autorisées (pas de singleton)', async () => {
      repo.findByType.mockResolvedValue({ ...VERIFICATION, type: 'PRO_DOCUMENT' });
      await service.submit('user-1', [
        { type: 'PRO_DOCUMENT', media_id: 'media-2' },
      ]);
      expect(repo.createPending).toHaveBeenCalled();
      expect(repo.reactivateRejected).not.toHaveBeenCalled();
    });

    it('réactivation en échec (ligne plus REJECTED) → 409', async () => {
      repo.findByType.mockResolvedValue({ ...VERIFICATION, status: 'REJECTED' });
      repo.reactivateRejected.mockResolvedValue(false);
      await expect(
        service.submit('user-1', [{ type: 'NATIONAL_ID', media_id: 'media-2' }]),
      ).rejects.toBeInstanceOf(VerificationPendingError);
    });
  });

  describe('gardes pro (RF-PW-W02/W03)', () => {
    it('utilisateur inconnu → 404 UserNotFoundError', async () => {
      findByUserId.mockResolvedValue(null);
      await expect(
        service.submit('user-1', [{ type: 'NATIONAL_ID', media_id: 'media-1' }]),
      ).rejects.toBeInstanceOf(UserNotFoundError);
    });

    it('compte anonymisé → 403 AccountAnonymizedError', async () => {
      findByUserId.mockResolvedValue({
        ...VIEW,
        profile: { ...VIEW.profile, anonymized_at: new Date() },
      });
      await expect(service.getStatus('user-1')).rejects.toBeInstanceOf(
        AccountAnonymizedError,
      );
    });

    it('compte suspendu → 403 AccountLockedError', async () => {
      findByUserId.mockResolvedValue({
        ...VIEW,
        profile: { ...VIEW.profile, user_status: 'SUSPENDED' },
      });
      await expect(service.getStatus('user-1')).rejects.toBeInstanceOf(
        AccountLockedError,
      );
    });

    it('non-PRO → 404 ProfessionalNotFoundError', async () => {
      findByUserId.mockResolvedValue({
        ...VIEW,
        profile: { ...VIEW.profile, role: 'CLIENT' },
      });
      await expect(service.getStatus('user-1')).rejects.toBeInstanceOf(
        ProfessionalNotFoundError,
      );
    });
  });

  describe('getStatus (RF-VR-06)', () => {
    it('dossier vide → PENDING, niveau 0, items []', async () => {
      const result = await service.getStatus('user-1');
      expect(result).toEqual({
        status: 'PENDING',
        verification_level: 0,
        items: [],
      });
    });

    it('CIN approuvé + selfie approuvé → APPROVED, niveau 2', async () => {
      repo.listByProfessional.mockResolvedValue([
        { ...VERIFICATION, type: 'NATIONAL_ID', status: 'APPROVED' },
        { ...VERIFICATION, id: 'ver-2', type: 'SELFIE', status: 'APPROVED' },
      ]);
      const result = await service.getStatus('user-1');
      expect(result.status).toBe('APPROVED');
      expect(result.verification_level).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it('+ justificatif approuvé → niveau 3', async () => {
      repo.listByProfessional.mockResolvedValue([
        { ...VERIFICATION, type: 'NATIONAL_ID', status: 'APPROVED' },
        { ...VERIFICATION, id: 'ver-2', type: 'SELFIE', status: 'APPROVED' },
        { ...VERIFICATION, id: 'ver-3', type: 'DIPLOMA', status: 'APPROVED' },
      ]);
      const result = await service.getStatus('user-1');
      expect(result.verification_level).toBe(3);
    });

    it('CIN approuvé seul → niveau 1', async () => {
      repo.listByProfessional.mockResolvedValue([
        { ...VERIFICATION, type: 'NATIONAL_ID', status: 'APPROVED' },
        { ...VERIFICATION, id: 'ver-2', type: 'SELFIE', status: 'PENDING' },
      ]);
      const result = await service.getStatus('user-1');
      expect(result.verification_level).toBe(1);
      expect(result.status).toBe('PENDING');
    });

    it('obligatoire rejeté → REJECTED', async () => {
      repo.listByProfessional.mockResolvedValue([
        { ...VERIFICATION, type: 'NATIONAL_ID', status: 'APPROVED' },
        { ...VERIFICATION, id: 'ver-2', type: 'SELFIE', status: 'REJECTED', note: 'flou' },
      ]);
      const result = await service.getStatus('user-1');
      expect(result.status).toBe('REJECTED');
    });
  });
});
