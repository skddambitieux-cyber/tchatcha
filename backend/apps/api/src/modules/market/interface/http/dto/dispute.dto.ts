import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export enum DisputeReason {
  WORK_NOT_CONFORMING = 'WORK_NOT_CONFORMING',
  WORK_INCOMPLETE = 'WORK_INCOMPLETE',
  LATE_OR_NO_SHOW = 'LATE_OR_NO_SHOW',
  PAYMENT_ISSUE = 'PAYMENT_ISSUE',
  OTHER = 'OTHER',
}

export class CreateDisputeDto {
  @IsUUID()
  booking_id: string;

  @IsEnum(DisputeReason)
  reason: DisputeReason;

  @IsString()
  @MinLength(1)
  @MaxLength(1500)
  description: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @Type(() => String)
  media_ids?: string[];
}

export class DisputeViewDto {
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
