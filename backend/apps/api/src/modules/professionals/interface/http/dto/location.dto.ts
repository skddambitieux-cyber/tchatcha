/**
 * TCHATCHA — DTO PUT /api/v1/professionals/me/location (36 §5.3, RF-PW-W09).
 * lat -90..90, lon -180..180, division_id uuid existant dans geo.divisions
 * (404 division_not_found sinon), service_radius_km 0.1..500, address_text
 * ≤ 500. country_code non modifiable. Version obligatoire (RF-PW-W04b).
 */
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class LocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lon: number;

  @IsOptional()
  @IsUUID()
  division_id?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(500)
  service_radius_km?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address_text?: string | null;

  @IsInt()
  @Min(1)
  version: number;
}
