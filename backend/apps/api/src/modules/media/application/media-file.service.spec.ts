/**
 * Tests unitaires MediaFileService — docs/37 §4 (6.3.5a).
 * Ports mockés (profile read + storage + media files) : gardes RF-PW-W02/W03
 * (404/403), whitelist purpose/MIME, bornes de taille RF-MD-03, purge RF-MD-07,
 * limite PROCESSING RF-MD-08, confirm RF-MD-06 (410/FAILED).
 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProfessionalProfileReadPortToken } from '../../auth/application/ports/professional-profile-read.port';
import {
  AccountAnonymizedError,
  AccountLockedError,
} from '../../auth/domain/errors/auth-errors';
import { StoragePortToken } from '../domain/ports/storage.port';
import { MediaFileRepositoryToken } from '../domain/ports/media-file-repository.port';
import {
  MediaInvalidError,
  MediaLimitExceededError,
  MediaNotFoundError,
  MediaNotUploadedError,
  MediaPurposeNotSupportedError,
  MediaSizeExceededError,
  MediaTypeNotSupportedError,
  ProfessionalNotFoundError,
} from '../domain/errors/media-errors';
import { MediaStorageConfig } from '../infrastructure/config/media-storage.config';
import { MediaFileService } from './media-file.service';

const PRO = {
  id: 'prof-1',
  role: 'PROFESSIONAL',
  user_status: 'ACTIVE',
  status: 'ACTIVE',
  country_code: 'BJ',
  anonymized_at: null,
};

const RECORD = {
  id: 'media-1',
  owner_id: 'prof-1',
  purpose: 'PORTFOLIO',
  media_type: 'IMAGE',
  mime_type: 'image/jpeg',
  size_bytes: 1024,
  width: null,
  height: null,
  duration_sec: null,
  url: 'http://localhost:9000/tchatcha/BJ/PROFESSIONAL/prof-1/a.jpg',
  s3_key: 'BJ/PROFESSIONAL/prof-1/a.jpg',
  sort_order: 0,
  status: 'PROCESSING',
  created_at: new Date(),
};

describe('MediaFileService — docs 37 §4 (6.3.5a)', () => {
  let service: MediaFileService;
  let findByUserId: jest.Mock;
  let storage: { presignUpload: jest.Mock; headObject: jest.Mock; deleteObject: jest.Mock };
  let repo: {
    createPending: jest.Mock;
    findOwnedProcessing: jest.Mock;
    findOwnedReady: jest.Mock;
    markFailed: jest.Mock;
    purgeStale: jest.Mock;
    countPending: jest.Mock;
  };

  beforeEach(async () => {
    findByUserId = jest.fn();
    storage = {
      presignUpload: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn(),
    };
    repo = {
      createPending: jest.fn(),
      findOwnedProcessing: jest.fn(),
      findOwnedReady: jest.fn(),
      markFailed: jest.fn(),
      purgeStale: jest.fn().mockResolvedValue([]),
      countPending: jest.fn().mockResolvedValue(0),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaFileService,
        MediaStorageConfig,
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        { provide: ProfessionalProfileReadPortToken, useValue: { findByUserId } },
        { provide: StoragePortToken, useValue: storage },
        { provide: MediaFileRepositoryToken, useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(MediaFileService);
  });

  describe('presign (RF-MD-01..08)', () => {
    it('succès nominal → ligne PROCESSING + URL présignée + clé RF-MD-05', async () => {
      findByUserId.mockResolvedValue(PRO);
      repo.createPending.mockResolvedValue(RECORD);
      storage.presignUpload.mockResolvedValue({
        url: 'http://fake/upload/BJ/PROFESSIONAL/prof-1/a.jpg',
        expiresIn: 900,
      });

      const result = await service.presign('user-1', {
        purpose: 'PORTFOLIO',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        width: null,
        height: null,
        durationSec: null,
      });

      expect(result.media_id).toBe('media-1');
      expect(result.expires_in).toBe(900);
      expect(repo.createPending).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'prof-1',
          purpose: 'PORTFOLIO',
          mediaType: 'IMAGE',
          mimeType: 'image/jpeg',
          s3Key: expect.stringMatching(
            /^BJ\/PROFESSIONAL\/prof-1\/[0-9a-f-]{36}\.jpg$/u,
          ),
        }),
      );
      expect(storage.presignUpload).toHaveBeenCalledWith({
        key: 'BJ/PROFESSIONAL/prof-1/a.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        bucket: 'public',
      });
    });

    it('pro introuvable ou non-pro → 404 ProfessionalNotFoundError', async () => {
      findByUserId.mockResolvedValue(null);
      await expect(
        service.presign('user-1', {
          purpose: 'PORTFOLIO',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
          width: null,
          height: null,
          durationSec: null,
        }),
      ).rejects.toBeInstanceOf(ProfessionalNotFoundError);
    });

    it('compte anonymisé → 403 AccountAnonymizedError', async () => {
      findByUserId.mockResolvedValue({ ...PRO, anonymized_at: new Date() });
      await expect(
        service.presign('user-1', {
          purpose: 'PORTFOLIO',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
          width: null,
          height: null,
          durationSec: null,
        }),
      ).rejects.toBeInstanceOf(AccountAnonymizedError);
    });

    it('compte suspendu/banni → 403 AccountLockedError', async () => {
      findByUserId.mockResolvedValue({ ...PRO, user_status: 'BANNED' });
      await expect(
        service.presign('user-1', {
          purpose: 'PORTFOLIO',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
          width: null,
          height: null,
          durationSec: null,
        }),
      ).rejects.toBeInstanceOf(AccountLockedError);
    });

    it('purpose DOCUMENT (réservé 6.3.5b) → 422 MediaPurposeNotSupportedError', async () => {
      findByUserId.mockResolvedValue(PRO);
      await expect(
        service.presign('user-1', {
          purpose: 'DOCUMENT',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
          width: null,
          height: null,
          durationSec: null,
        }),
      ).rejects.toBeInstanceOf(MediaPurposeNotSupportedError);
    });

    it('MIME hors whitelist → 422 MediaTypeNotSupportedError', async () => {
      findByUserId.mockResolvedValue(PRO);
      await expect(
        service.presign('user-1', {
          purpose: 'PORTFOLIO',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          width: null,
          height: null,
          durationSec: null,
        }),
      ).rejects.toBeInstanceOf(MediaTypeNotSupportedError);
    });

    it('taille > 20 Mo (IMAGE) → 422 MediaSizeExceededError', async () => {
      findByUserId.mockResolvedValue(PRO);
      await expect(
        service.presign('user-1', {
          purpose: 'PORTFOLIO',
          mimeType: 'image/jpeg',
          sizeBytes: 21 * 1024 * 1024,
          width: null,
          height: null,
          durationSec: null,
        }),
      ).rejects.toBeInstanceOf(MediaSizeExceededError);
    });

    it('taille > 100 Mo (VIDEO) → 422 MediaSizeExceededError', async () => {
      findByUserId.mockResolvedValue(PRO);
      await expect(
        service.presign('user-1', {
          purpose: 'BEFORE_AFTER',
          mimeType: 'video/mp4',
          sizeBytes: 101 * 1024 * 1024,
          width: null,
          height: null,
          durationSec: null,
        }),
      ).rejects.toBeInstanceOf(MediaSizeExceededError);
    });

    it('taille <= 0 → 422 MediaSizeExceededError', async () => {
      findByUserId.mockResolvedValue(PRO);
      await expect(
        service.presign('user-1', {
          purpose: 'PORTFOLIO',
          mimeType: 'image/jpeg',
          sizeBytes: 0,
          width: null,
          height: null,
          durationSec: null,
        }),
      ).rejects.toBeInstanceOf(MediaSizeExceededError);
    });

    it('50 PROCESSING atteints → 422 MediaLimitExceededError', async () => {
      findByUserId.mockResolvedValue(PRO);
      repo.countPending.mockResolvedValue(50);
      await expect(
        service.presign('user-1', {
          purpose: 'PORTFOLIO',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
          width: null,
          height: null,
          durationSec: null,
        }),
      ).rejects.toBeInstanceOf(MediaLimitExceededError);
      expect(repo.createPending).not.toHaveBeenCalled();
    });

    it('purge des orphelins > 24 h : ligne + objet best-effort (RF-MD-07)', async () => {
      findByUserId.mockResolvedValue(PRO);
      repo.purgeStale.mockResolvedValue(['BJ/PROFESSIONAL/prof-1/orphan.jpg']);
      storage.deleteObject.mockRejectedValue(new Error('réseau'));
      repo.createPending.mockResolvedValue(RECORD);
      storage.presignUpload.mockResolvedValue({ url: 'u', expiresIn: 900 });

      await service.presign('user-1', {
        purpose: 'PORTFOLIO',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        width: null,
        height: null,
        durationSec: null,
      });

      expect(storage.deleteObject).toHaveBeenCalledWith(
        'BJ/PROFESSIONAL/prof-1/orphan.jpg',
        'public',
      );
    });
  });

  describe('verifyForConfirm (RF-MD-06)', () => {
    it('succès → record PROCESSING retourné, taille vérifiée', async () => {
      repo.findOwnedProcessing.mockResolvedValue(RECORD);
      storage.headObject.mockResolvedValue({ sizeBytes: 1024, contentType: 'image/jpeg' });

      const record = await service.verifyForConfirm('user-1', 'media-1');
      expect(record.id).toBe('media-1');
      expect(repo.markFailed).not.toHaveBeenCalled();
    });

    it('ligne inconnue/d’un autre pro → 404 MediaNotFoundError', async () => {
      repo.findOwnedProcessing.mockResolvedValue(null);
      await expect(service.verifyForConfirm('user-1', 'media-1')).rejects.toBeInstanceOf(
        MediaNotFoundError,
      );
    });

    it('objet absent du bucket → 410 MediaNotUploadedError', async () => {
      repo.findOwnedProcessing.mockResolvedValue(RECORD);
      storage.headObject.mockResolvedValue(null);
      await expect(service.verifyForConfirm('user-1', 'media-1')).rejects.toBeInstanceOf(
        MediaNotUploadedError,
      );
    });

    it('taille réelle > max → ligne FAILED + 422 MediaInvalidError', async () => {
      repo.findOwnedProcessing.mockResolvedValue(RECORD);
      storage.headObject.mockResolvedValue({
        sizeBytes: 30 * 1024 * 1024,
        contentType: 'image/jpeg',
      });
      await expect(service.verifyForConfirm('user-1', 'media-1')).rejects.toBeInstanceOf(
        MediaInvalidError,
      );
      expect(repo.markFailed).toHaveBeenCalledWith('user-1', 'media-1');
    });
  });

  describe('findOwnedReady / deleteObject', () => {
    it('findOwnedReady délègue au repository', async () => {
      repo.findOwnedReady.mockResolvedValue({ ...RECORD, status: 'READY' });
      const record = await service.findOwnedReady('user-1', 'media-1');
      expect(record?.status).toBe('READY');
    });

    it('deleteObject délègue au storage (bucket public)', async () => {
      await service.deleteObject('BJ/PROFESSIONAL/prof-1/a.jpg');
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'BJ/PROFESSIONAL/prof-1/a.jpg',
        'public',
      );
    });
  });
});
