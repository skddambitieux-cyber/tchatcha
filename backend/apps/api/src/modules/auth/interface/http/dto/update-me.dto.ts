/**
 * TCHATCHA — DTO PUT /api/v1/me (6.3.2, docs/34-cadrage-users-lot-6-3-2.md §3).
 * Remplacement total des champs d'identité (RF-ME-W02/W04) : full_name, locale,
 * email, avatar_url + version (verrouillage optimiste). Toute autre clé dans le
 * body est refusée par le ValidationPipe global (forbidNonWhitelisted, 400).
 */
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateMeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name: string;

  @IsString()
  @Matches(/^[a-z]{2}$/, { message: 'locale must be 2 lowercase letters' })
  locale: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  avatar_url?: string | null;

  @IsInt()
  @Min(1)
  version: number;
}