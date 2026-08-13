/**
 * TCHATCHA — Configuration d'environnement validée.
 * Source : 17-infrastructure.md, 15-securite.md, 37-cadrage-users-lot-6-3-5a.md.
 * Valeurs : `.env.example`. Les variables S3 sont optionnelles avec défauts dev
 * (MinIO local) ; le bucket manquant est détecté au runtime (presign).
 */
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EnvironmentVariables {
  @IsOptional() @IsString()
  MARKET_TIMEZONE = 'Africa/Lagos';
  @IsString()
  NODE_ENV = 'development';

  @IsString()
  PORT = '3000';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  S3_ENDPOINT = 'http://localhost:9000';

  @IsOptional()
  @IsString()
  S3_REGION = 'auto';

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY_ID = 'minioadmin';

  @IsOptional()
  @IsString()
  S3_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET_PUBLIC = 'tchatcha';

  @IsOptional()
  @IsString()
  S3_BUCKET_PRIVATE = 'tchatcha-private';

  @IsOptional()
  @IsIn(['true', 'false'])
  S3_FORCE_PATH_STYLE = 'true';

  /** Durée de validité des URLs présignées en secondes (RF-MD-04, défaut 900). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  S3_PRESIGN_TTL_SECONDS = 900;

  /** URL publique du bucket (MinIO : {endpoint}/{bucket} ; R2 : domaine CDN). */
  @IsOptional()
  @IsString()
  S3_PUBLIC_URL_BASE?: string;
}
