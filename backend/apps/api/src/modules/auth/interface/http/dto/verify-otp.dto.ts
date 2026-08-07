/**
 * TCHATCHA — DTO POST /api/v1/auth/otp/verify (27-api-contracts-auth.md §3).
 */
import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { OtpPurpose } from '../../../domain/entities/otp-code.entity';
import { DeviceDto } from './request-otp.dto';

export class VerifyOtpDto {
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

  @IsIn([OtpPurpose.REGISTER, OtpPurpose.LOGIN], {
    message: 'purpose must be REGISTER or LOGIN',
  })
  purpose: OtpPurpose;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}