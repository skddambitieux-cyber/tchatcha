/**
 * TCHATCHA — DTO PUT /api/v1/professionals/me (36 §5.3, RF-PW-W04).
 * Remplacement total de la vitrine : champs facultatifs nullables + version
 * (verrouillage optimiste RF-PW-W04b). Toute clé inconnue → 400
 * (ValidationPipe global forbidNonWhitelisted).
 */
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateShowcaseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  business_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  headline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  experience_years?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  employees_count?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  min_price?: number | null;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  website?: string | null;

  @IsOptional()
  @IsObject()
  social_links?: Record<string, string> | null;

  @IsInt()
  @Min(1)
  version: number;
}
