/**
 * TCHATCHA — DTOs dossier de vérification (38 §4.2, RF-VR-03/06).
 * Soumission : items { type, media_id } — la whitelist des types (RF-VR-02)
 * est appliquée par le service → 422 verification_type_not_supported.
 */
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class VerificationItemDto {
  @IsString()
  type: string;

  @IsUUID()
  media_id: string;
}

export class SubmitVerificationDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => VerificationItemDto)
  items: VerificationItemDto[];
}
