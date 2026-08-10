/**
 * TCHATCHA — DTO DELETE /api/v1/professionals/me/services/:id (36 §5.3).
 * Le corps porte uniquement la version (RF-PW-W04b) : suppression avec
 * verrouillage optimiste, 409 version_conflict sinon.
 */
import { IsInt, Min } from 'class-validator';

export class DeleteServiceDto {
  @IsInt()
  @Min(1)
  version: number;
}
