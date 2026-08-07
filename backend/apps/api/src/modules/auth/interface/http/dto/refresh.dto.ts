/**
 * TCHATCHA — DTO POST /api/v1/auth/refresh (27-api-contracts-auth.md §6).
 */
import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { DeviceDto } from './request-otp.dto';

export class RefreshDto {
  @IsString()
  refresh_token: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}