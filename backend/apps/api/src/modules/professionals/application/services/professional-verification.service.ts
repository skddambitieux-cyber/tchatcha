/**
 * TCHATCHA — ProfessionalVerificationService (38 §4.2, RF-VR-02..07).
 * Dossier de vérification du pro (6.3.5b-1) : soumission de documents
 * (CIN + selfie obligatoires, justificatifs optionnels) et lecture d'état.
 * Gardes pro identiques à la vitrine (404/403, RF-PW-W02/W03) ; la ligne
 * media est confirmée (HEAD → READY) puis rattachée à une ligne
 * pros.verifications + sa tâche admin.validation_tasks (transaction).
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ProfessionalShowcaseReadPortToken,
} from '../ports/professional-showcase-read.port';
import type { ProfessionalShowcaseReadPort } from '../ports/professional-showcase-read.port';
import { ProfessionalEventPublisherPortToken } from '../ports/event-publisher.port';
import type { ProfessionalEventPublisherPort } from '../ports/event-publisher.port';
import {
  ProfessionalVerificationRepositoryToken,
} from '../ports/professional-verification-repository.port';
import type {
  VerificationRecord,
  ProfessionalVerificationRepository,
} from '../ports/professional-verification-repository.port';
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
import { UserRole } from '../../../auth/domain/entities/user-role';
import { UserStatus } from '../../../auth/domain/entities/user.entity';

/** Types de documents (RF-VR-02) — CIN + selfie obligatoires. */
const VERIFICATION_TYPES = new Set([
  'NATIONAL_ID',
  'SELFIE',
  'PRO_DOCUMENT',
  'DIPLOMA',
]);

/** Types à ligne unique (une seule ligne active par type, RF-VR-02). */
const SINGLETON_TYPES = new Set(['NATIONAL_ID', 'SELFIE']);

export interface VerificationItemCommand {
  type: string;
  media_id: string;
}

export interface VerificationItemResponse {
  id: string;
  type: string;
  media_id: string;
  mime_type: string;
  status: string;
  note: string | null;
  created_at: string;
}

export interface VerificationDossierResponse {
  status: string;
  verification_level: number;
  items: VerificationItemResponse[];
}

export interface SubmitVerificationResponse {
  verifications: { id: string; type: string; status: string; created_at: string }[];
}

@Injectable()
export class ProfessionalVerificationService {
  constructor(
    @Inject(ProfessionalShowcaseReadPortToken)
    private readonly showcase: ProfessionalShowcaseReadPort,
    @Inject(ProfessionalVerificationRepositoryToken)
    private readonly repo: ProfessionalVerificationRepository,
    @Inject(ProfessionalEventPublisherPortToken)
    private readonly events: ProfessionalEventPublisherPort,
    private readonly media: MediaFileService,
  ) {}

  /**
   * POST /professionals/me/verifications (RF-VR-03/04/05/07).
   * Chaque item : type whitelist → document du pro confirmé (HEAD → READY) →
   * anti-réutilisation → ligne PENDING (ou réactivation REJECTED) + tâche admin.
   */
  async submit(
    userId: string,
    items: VerificationItemCommand[],
  ): Promise<SubmitVerificationResponse> {
    const view = await this.assertWritable(userId);
    const verifications: SubmitVerificationResponse['verifications'] = [];
    for (const item of items) {
      if (!VERIFICATION_TYPES.has(item.type)) {
        throw new VerificationTypeNotSupportedError();
      }
      await this.media.confirmDocument(userId, item.media_id);
      if (await this.repo.isMediaReferenced(item.media_id)) {
        throw new DocumentAlreadyUsedError();
      }
      if (SINGLETON_TYPES.has(item.type)) {
        const existing = await this.repo.findByType(userId, item.type);
        if (existing?.status === 'PENDING') {
          throw new VerificationPendingError();
        }
        if (existing?.status === 'APPROVED') {
          throw new VerificationAlreadyApprovedError();
        }
        if (existing) {
          const ok = await this.repo.reactivateRejected(
            userId,
            existing.id,
            item.media_id,
          );
          if (!ok) {
            throw new VerificationPendingError();
          }
          verifications.push({
            id: existing.id,
            type: item.type,
            status: 'PENDING',
            created_at: new Date().toISOString(),
          });
          continue;
        }
      }
      const record = await this.repo.createPending({
        userId,
        type: item.type,
        mediaId: item.media_id,
      });
      verifications.push({
        id: record.id,
        type: record.type,
        status: record.status,
        created_at: record.created_at.toISOString(),
      });
    }
    this.events.publish({
      type: 'pros.verification.submitted',
      payload: {
        professional_id: view.profile?.id,
        user_id: userId,
        verifications,
      },
    });
    return { verifications };
  }

  /** GET /professionals/me/verification (RF-VR-06) — projection du dossier. */
  async getStatus(userId: string): Promise<VerificationDossierResponse> {
    await this.assertWritable(userId);
    const items = await this.repo.listByProfessional(userId);
    const responses = items.map((item) => this.toItem(item));
    return {
      status: globalStatus(items),
      verification_level: deriveLevel(items),
      items: responses,
    };
  }

  private toItem(item: VerificationRecord): VerificationItemResponse {
    return {
      id: item.id,
      type: item.type,
      media_id: item.media_id,
      mime_type: item.mime_type,
      status: item.status,
      note: item.note,
      created_at: item.created_at.toISOString(),
    };
  }

  /** Gardes RF-PW-W02/W03 (404/403) — mêmes que la vitrine. */
  private async assertWritable(
    userId: string,
  ): Promise<NonNullable<Awaited<ReturnType<ProfessionalShowcaseReadPort['findByUserId']>>>> {
    const view = await this.showcase.findByUserId(userId);
    if (!view) {
      throw new UserNotFoundError();
    }
    const { profile } = view;
    if (profile.anonymized_at) {
      throw new AccountAnonymizedError();
    }
    if (
      profile.user_status === UserStatus.SUSPENDED ||
      profile.user_status === UserStatus.BANNED
    ) {
      throw new AccountLockedError();
    }
    if (profile.role !== UserRole.PROFESSIONAL || !profile.id) {
      throw new ProfessionalNotFoundError();
    }
    if (profile.status === 'SUSPENDED') {
      throw new AccountLockedError();
    }
    return view;
  }
}

/** Statut global du dossier (RF-VR-06) : PENDING si attente, sinon REJECTED si
 * un document obligatoire est rejeté, sinon APPROVED. */
function globalStatus(items: VerificationRecord[]): string {
  if (items.some((i) => i.status === 'PENDING')) return 'PENDING';
  if (
    items.some(
      (i) => SINGLETON_TYPES.has(i.type) && i.status === 'REJECTED',
    )
  ) {
    return 'REJECTED';
  }
  return items.length > 0 ? 'APPROVED' : 'PENDING';
}

/** Dérivation lecture de verification_level (38 RF-VR-11, même règle que le
 * recompute admin) : 0 rien · 1 CIN · 2 + selfie (badge) · 3 + justificatif. */
function deriveLevel(items: VerificationRecord[]): number {
  const approved = new Map<string, boolean>();
  for (const item of items) {
    if (item.status === 'APPROVED') {
      approved.set(item.type, true);
    }
  }
  if (approved.get('NATIONAL_ID') && approved.get('SELFIE')) {
    if (
      approved.get('PRO_DOCUMENT') ||
      approved.get('DIPLOMA')
    ) {
      return 3;
    }
    return 2;
  }
  if (approved.get('NATIONAL_ID')) return 1;
  return 0;
}
