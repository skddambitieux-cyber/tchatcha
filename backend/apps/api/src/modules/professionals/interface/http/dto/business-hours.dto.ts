/**
 * TCHATCHA — DTO PUT /api/v1/professionals/me/business_hours (36 §5.3,
 * RF-PW-W08). Remplacement atomique du jeu hebdomadaire : 0-7 lignes,
 * weekday unique 1-7 (doublon → 422 sémantique), open_at/close_at HH:MM:SS
 * (format → 400 ValidationPipe, close ≤ open → 422), version obligatoire.
 */
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BusinessHoursItemDto {
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d:00$/, {
    message: 'open_at must be HH:MM:SS (seconds :00)',
  })
  open_at: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d:00$/, {
    message: 'close_at must be HH:MM:SS (seconds :00)',
  })
  close_at: string;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

export class BusinessHoursDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BusinessHoursItemDto)
  hours: BusinessHoursItemDto[];

  @IsInt()
  @Min(1)
  version: number;
}
