/**
 * TCHATCHA — DTO POST /api/v1/media/presign (37 §3.1, RF-MD-01/02/03).
 * Le client déclare le fichier (jamais transmis au backend, ADR-007) :
 * purpose whitelist, MIME whitelist, taille > 0 (bornée selon IMAGE/VIDEO).
 */
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class PresignMediaDto {
  /**
   * Purpose libre côté DTO : la whitelist métier (RF-MD-01) est appliquée par
   * MediaFileService → 422 media_purpose_not_supported (jamais 400).
   */
  @IsString()
  purpose: string;

  @IsString()
  mime_type: string;

  @IsInt()
  @Min(1)
  size_bytes: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  duration_sec?: number;
}
