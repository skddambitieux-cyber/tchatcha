/**
 * TCHATCHA — DTOs services vitrine (36 §5.3, RF-PW-W05/W06/W07).
 * POST /professionals/me/services (201) et PUT /professionals/me/services/:id
 * (200) : mêmes champs, version obligatoire (RF-PW-W04b).
 */
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const PRICE_UNITS = [
  'PER_M2',
  'PER_DAY',
  'PER_HOUR',
  'PER_JOB',
  'PER_MEAL',
] as const;

export class ServiceDto {
  @IsUUID()
  category_id: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  price_from?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  price_to?: number | null;

  @IsOptional()
  @IsIn(PRICE_UNITS)
  price_unit?: (typeof PRICE_UNITS)[number] | null;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsInt()
  @Min(1)
  version: number;
}
