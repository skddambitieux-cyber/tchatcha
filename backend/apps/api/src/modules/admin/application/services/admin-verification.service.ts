import { Inject, Injectable } from '@nestjs/common';
import { StoragePortToken } from '../../../media/domain/ports/storage.port';
import type { StoragePort } from '../../../media/domain/ports/storage.port';
import { ProfessionalEventPublisherPortToken } from '../../../professionals/application/ports/event-publisher.port';
import type { ProfessionalEventPublisherPort } from '../../../professionals/application/ports/event-publisher.port';
import { globalStatus } from '../../../professionals/application/services/professional-verification.service';
import { AdminVerificationRepositoryToken } from '../ports/admin-verification-repository.port';
import type { AdminVerificationRepository } from '../ports/admin-verification-repository.port';
import { MissingReasonError, VerificationNotFoundError, VerificationPendingError } from '../../domain/errors/admin-errors';

@Injectable()
export class AdminVerificationService {
  constructor(
    @Inject(AdminVerificationRepositoryToken) private readonly repo: AdminVerificationRepository,
    @Inject(StoragePortToken) private readonly storage: StoragePort,
    @Inject(ProfessionalEventPublisherPortToken) private readonly events: ProfessionalEventPublisherPort,
  ) {}

  async list(status: string, page: number, limit: number) {
    const result = await this.repo.list(status, page, limit);
    const items = await Promise.all(result.items.map(async (item) => {
      const signed = await this.storage.presignRead({ key: item.s3_key, bucket: 'private' });
      return { id: item.id, professional_id: item.professional_id, business_name: item.business_name,
        type: item.type, media_id: item.media_id, mime_type: item.mime_type, status: item.status,
        note: item.note, created_at: item.created_at.toISOString(),
        documents: [{ type: item.type, media_id: item.media_id, mime_type: item.mime_type, url: signed.url }] };
    }));
    return { items, page, limit, total: result.total };
  }

  async decide(id: string, adminId: string, approve: boolean, reason?: string) {
    const normalizedReason = reason?.trim() || null;
    if (!approve && !normalizedReason) throw new MissingReasonError();
    const result = await this.repo.decide(id, adminId, approve, normalizedReason);
    if (result === 'NOT_FOUND') throw new VerificationNotFoundError();
    if (result === 'INVALID_STATE') throw new VerificationPendingError();
    const event = approve ? 'pros.verification.approved' : 'pros.verification.rejected';
    this.events.publish({ type: event, payload: { verification_id: id, professional_id: result.professionalId, admin_id: adminId } });
    this.events.publish({ type: 'admin.verification.decided', payload: { verification_id: id, professional_id: result.professionalId, admin_id: adminId, approved: approve } });
    return { status: globalStatus(result.dossier), verification_level: result.level,
      items: result.dossier.map((item) => ({ id: item.id, type: item.type, media_id: item.media_id,
        mime_type: item.mime_type, status: item.status, note: item.note, created_at: item.created_at.toISOString() })) };
  }
}
