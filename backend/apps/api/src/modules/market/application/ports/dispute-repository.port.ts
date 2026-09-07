import type { CreateDisputeDto } from '../../interface/http/dto/dispute.dto';

export interface DisputeView {
  id: string;
  booking_id: string;
  opened_by: string;
  reason: string;
  description: string;
  media_ids: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OpenDisputeCommand {
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  dto: CreateDisputeDto;
}

export type OpenDisputeResult = DisputeView | 'NOT_FOUND' | 'FORBIDDEN' |
  'INVALID_STATE' | 'ALREADY_OPEN' | 'IDEMPOTENCY_MISMATCH' |
  'COMPLETION_IN_PROGRESS' | 'MEDIA_INVALID';

export interface DisputeRepositoryPort {
  open(command: OpenDisputeCommand): Promise<OpenDisputeResult>;
  findVisible(id: string, actorId: string): Promise<DisputeView | 'FORBIDDEN' | null>;
}

export const DisputeRepositoryPortToken = Symbol('DisputeRepositoryPort');
