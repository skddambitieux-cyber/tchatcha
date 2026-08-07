/**
 * TCHATCHA — DTO POST /api/v1/auth/login (27-api-contracts-auth.md §4).
 * Alias sémantique de otp/verify(LOGIN) : pas de champ purpose.
 */
import { Type } from 'class-transformer';
import {
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { DeviceDto } from './request-otp.dto';

export class LoginDto {
  @IsISO31661Alpha2()
  country_code: string;

  @IsString()
  @Matches(/^[0-9]{8,15}$/, {
    message: 'phone must contain 8 to 15 digits, without + or spaces',
  })
  phone: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit code' })
  code: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}