/**
 * TCHATCHA — DTO POST /api/v1/auth/otp/request (27-api-contracts-auth.md §2).
 */
import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO31661Alpha2,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { OtpPurpose } from '../../../domain/entities/otp-code.entity';

export class DeviceDto {
  @IsString()
  @IsNotEmpty()
  session_id: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  user_agent?: string;

  @IsOptional()
  @IsString()
  ip?: string;
}

export class RequestOtpDto {
  @IsISO31661Alpha2()
  country_code: string;

  @IsString()
  @Matches(/^[0-9]{8,15}$/, {
    message: 'phone must contain 8 to 15 digits, without + or spaces',
  })
  phone: string;

  @IsIn([OtpPurpose.REGISTER, OtpPurpose.LOGIN], {
    message: 'purpose must be REGISTER or LOGIN',
  })
  purpose: OtpPurpose;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}
