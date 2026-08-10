/**
 * TCHATCHA — MediaFileService (37 §4). Presign et cycle de vie des lignes
 * media.files : PROCESSING (presign, invisible) → READY/FAILED (confirm).
 * Sans règles vitrine (version/événement = module professionals, RF-PW-P06).
 * Gardes du pro : mêmes que la vitrine (RF-PW-W02/W03 — 404/403).
 */
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProfessionalProfileReadPortToken } from '../../auth/application/ports/professional-profile-read.port';
import type { ProfessionalProfileReadPort } from '../../auth/application/ports/professional-profile-read.port';
import {
  AccountAnonymizedError,
  AccountLockedError,
} from '../../auth/domain/errors/auth-errors';
import { StoragePortToken } from '../domain/ports/storage.port';
import type { StoragePort } from '../domain/ports/storage.port';
import { MediaFileRepositoryToken } from '../domain/ports/media-file-repository.port';
import type {
  MediaFileRecord,
  MediaFileRepository,
} from '../domain/ports/media-file-repository.port';
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
import { UserRole } from '../../auth/domain/entities/user-role';
import { UserStatus } from '../../auth/domain/entities/user.entity';

/** Whitelist MIME portfolio (RF-MD-02) → media_type + extension de clé. */
const MIME_MAP: Record<string, { mediaType: string; ext: string }> = {
  'image/jpeg': { mediaType: 'IMAGE', ext: 'jpg' },
  'image/png': { mediaType: 'IMAGE', ext: 'png' },
  'image/webp': { mediaType: 'IMAGE', ext: 'webp' },
  'video/mp4': { mediaType: 'VIDEO', ext: 'mp4' },
  'video/quicktime': { mediaType: 'VIDEO', ext: 'mov' },
  'video/webm': { mediaType: 'VIDEO', ext: 'webm' },
};

/** Whitelist MIME DOCUMENT (RF-VR-01) — CIN/justificatifs, bucket privé. */
const DOCUMENT_MIME_MAP: Record<string, { mediaType: string; ext: string }> = {
  'image/jpeg': { mediaType: 'IMAGE', ext: 'jpg' },
  'image/png': { mediaType: 'IMAGE', ext: 'png' },
  'image/webp': { mediaType: 'IMAGE', ext: 'webp' },
  'application/pdf': { mediaType: 'DOCUMENT', ext: 'pdf' },
};

/** Tailles maximales (RF-MD-03, RF-VR-01) : 20 Mo image, 100 Mo vidéo, 10 Mo doc. */
const MAX_SIZE_BYTES: Record<string, number> = {
  IMAGE: 20 * 1024 * 1024,
  VIDEO: 100 * 1024 * 1024,
  DOCUMENT: 10 * 1024 * 1024,
};

/** Whitelist purpose (RF-MD-01 + RF-VR-01 — DOCUMENT = dossier privé 6.3.5b). */
const ALLOWED_PURPOSES = new Set(['PORTFOLIO', 'BEFORE_AFTER', 'DOCUMENT']);

/** Lignes PROCESSING en attente max par pro (RF-MD-08). */
const MAX_PENDING = 50;

/** Âge au-delà duquel un PROCESSING orphelin est purgé (RF-MD-07). */
const STALE_PENDING_HOURS = 24;

export interface PresignCommand {
  purpose: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

export interface PresignResult {
  media_id: string;
  upload_url: string;
  s3_key: string;
  expires_in: number;
}

@Injectable()
export class MediaFileService {
  constructor(
    @Inject(ProfessionalProfileReadPortToken)
    private readonly profileRead: ProfessionalProfileReadPort,
    @Inject(StoragePortToken)
    private readonly storage: StoragePort,
    @Inject(MediaFileRepositoryToken)
    private readonly media: MediaFileRepository,
    private readonly storageConfig: MediaStorageConfig,
  ) {}

  /** POST /media/presign (RF-MD-01..05/07/08, RF-VR-01) — aucun fichier reçu. */
  async presign(userId: string, cmd: PresignCommand): Promise<PresignResult> {
    const profile = await this.assertProfessional(userId);
    this.assertPurpose(cmd.purpose);
    const isDocument = cmd.purpose === 'DOCUMENT';
    const mapped = (isDocument ? DOCUMENT_MIME_MAP : MIME_MAP)[cmd.mimeType];
    if (!mapped) {
      throw new MediaTypeNotSupportedError();
    }
    // RF-VR-01 : un document est borné à 10 Mo quel que soit son type réel
    // (image ou pdf) ; les autres purposes suivent RF-MD-03.
    const max = isDocument
      ? MAX_SIZE_BYTES.DOCUMENT
      : MAX_SIZE_BYTES[mapped.mediaType];
    if (cmd.sizeBytes <= 0 || cmd.sizeBytes > max) {
      throw new MediaSizeExceededError();
    }

    // RF-MD-07 : purge opportuniste des orphelins (> 24 h) — ligne + objet.
    const staleSince = new Date(Date.now() - STALE_PENDING_HOURS * 3600 * 1000);
    const staleKeys = await this.media.purgeStale(profile.id, staleSince);
    for (const stale of staleKeys) {
      try {
        await this.storage.deleteObject(
          stale.s3Key,
          stale.purpose === 'DOCUMENT' ? 'private' : 'public',
        );
      } catch {
        // suppression best-effort : ligne déjà purgée, objet reste sur TTL R2.
      }
    }

    // RF-MD-08 : limite de lignes PROCESSING en attente.
    if ((await this.media.countPending(profile.id)) >= MAX_PENDING) {
      throw new MediaLimitExceededError();
    }

    // RF-MD-05 : clé {country}/{owner_type}/{owner_id}/{uuid}.{ext}.
    const s3Key = `${profile.country_code}/PROFESSIONAL/${profile.id}/${randomUUID()}.${mapped.ext}`;
    const cfg = this.storageConfig.get();
    // RF-VR-01 : les documents (CIN) vont au bucket privé — URL interne jamais
    // exposée publiquement (stratégie infra+accès, 38 §6).
    const url = isDocument
      ? `s3://private/${s3Key}`
      : `${cfg.publicUrlBase.replace(/\/+$/u, '')}/${s3Key}`;

    const record = await this.media.createPending({
      ownerId: profile.id,
      purpose: cmd.purpose,
      mediaType: mapped.mediaType,
      mimeType: cmd.mimeType,
      sizeBytes: cmd.sizeBytes,
      width: cmd.width,
      height: cmd.height,
      durationSec: cmd.durationSec,
      url,
      s3Key,
    });

    const { url: uploadUrl, expiresIn } = await this.storage.presignUpload({
      key: record.s3_key,
      contentType: record.mime_type,
      sizeBytes: record.size_bytes,
      bucket: isDocument ? 'private' : 'public',
    });
    return {
      media_id: record.id,
      upload_url: uploadUrl,
      s3_key: record.s3_key,
      expires_in: expiresIn,
    };
  }

  /**
   * Vérifications avant confirm (RF-MD-06) : ligne PROCESSING du pro, objet
   * présent (410), taille réelle ≤ max (sinon FAILED + 422). Bucket selon le
   * purpose (DOCUMENT → privé, RF-VR-01).
   */
  async verifyForConfirm(
    userId: string,
    mediaId: string,
  ): Promise<MediaFileRecord> {
    const record = await this.media.findOwnedProcessing(userId, mediaId);
    if (!record) {
      throw new MediaNotFoundError();
    }
    const bucket = record.purpose === 'DOCUMENT' ? 'private' : 'public';
    const meta = await this.storage.headObject(record.s3_key, bucket);
    if (!meta) {
      throw new MediaNotUploadedError();
    }
    const max =
      record.purpose === 'DOCUMENT'
        ? MAX_SIZE_BYTES.DOCUMENT
        : MAX_SIZE_BYTES[record.media_type];
    if (meta.sizeBytes > max) {
      await this.media.markFailed(userId, mediaId);
      throw new MediaInvalidError();
    }
    return record;
  }

  /**
   * RF-VR-03 : confirmation d'un document privé (purpose DOCUMENT).
   * HEAD S3 (410/422), puis PROCESSING → READY. 404 non-dévoilant si le média
   * n'est pas un document du pro (jamais de PORTFOLIO ici).
   */
  async confirmDocument(userId: string, mediaId: string): Promise<MediaFileRecord> {
    const record = await this.media.findOwnedProcessing(userId, mediaId);
    if (!record || record.purpose !== 'DOCUMENT') {
      throw new MediaNotFoundError();
    }
    const meta = await this.storage.headObject(record.s3_key, 'private');
    if (!meta) {
      throw new MediaNotUploadedError();
    }
    if (meta.sizeBytes > MAX_SIZE_BYTES.DOCUMENT) {
      await this.media.markFailed(userId, mediaId);
      throw new MediaInvalidError();
    }
    await this.media.markReady(userId, mediaId);
    return { ...record, status: 'READY' };
  }

  /** Ligne READY du pro (update/delete portfolio) — null sinon (404). */
  async findOwnedReady(
    userId: string,
    mediaId: string,
  ): Promise<MediaFileRecord | null> {
    return this.media.findOwnedReady(userId, mediaId);
  }

  /** Suppression de l'objet S3 (RF-PW-P03, idempotent). */
  async deleteObject(s3Key: string, bucket: 'public' | 'private'): Promise<void> {
    await this.storage.deleteObject(s3Key, bucket);
  }

  /** Gardes RF-PW-W02/W03 (mêmes 404/403 que la vitrine). */
  private async assertProfessional(userId: string): Promise<{
    id: string;
    country_code: string;
  }> {
    const view = await this.profileRead.findByUserId(userId);
    if (!view || view.role !== UserRole.PROFESSIONAL) {
      throw new ProfessionalNotFoundError();
    }
    if (view.anonymized_at) {
      throw new AccountAnonymizedError();
    }
    if (
      view.user_status === UserStatus.SUSPENDED ||
      view.user_status === UserStatus.BANNED
    ) {
      throw new AccountLockedError();
    }
    if (view.status === 'SUSPENDED') {
      throw new AccountLockedError();
    }
    return { id: view.id, country_code: view.country_code };
  }

  private assertPurpose(purpose: string): void {
    if (!ALLOWED_PURPOSES.has(purpose)) {
      throw new MediaPurposeNotSupportedError();
    }
  }
}
