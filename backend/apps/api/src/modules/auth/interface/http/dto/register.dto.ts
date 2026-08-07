/**
 * TCHATCHA — DTO POST /api/v1/auth/register (27-api-contracts-auth.md §5, D5).
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { UserRole } from '../../../domain/entities/user-role';
import { DeviceDto } from './request-otp.dto';

export class ConsentsDto {
  @IsBoolean()
  cgv: boolean;

  @IsOptional()
  @IsBoolean()
  privacy?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @IsOptional()
  @IsBoolean()
  location?: boolean;
}

export class RegisterDto {
  @IsISO31661Alpha2()
  country_code: string;

  @IsString()
  @Matches(/^[0-9]{8,15}$/, {
    message: 'phone must contain 8 to 15 digits, without + or spaces',
  })
  phone: string;

  @IsString()
  @Length(2, 80, { message: 'full_name must be 2-80 characters' })
  full_name: string;

  @IsIn([UserRole.CLIENT, UserRole.PROFESSIONAL, UserRole.DELIVERER], {
    message: 'role must be CLIENT, PROFESSIONAL or DELIVERER',
  })
  role: UserRole;

  @ValidateNested()
  @Type(() => ConsentsDto)
  consents: ConsentsDto;

  @IsOptional()
  @IsString()
  category_id?: string;

  @IsOptional()
  @IsString()
  division_id?: string;

  @IsOptional()
  @IsString()
  locality_id?: string;

  @IsOptional()
  @IsString()
  delivery_zone?: string;

  @IsOptional()
  @IsString()
  delivery_means?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}