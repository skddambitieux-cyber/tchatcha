/**
 * TCHATCHA — Configuration d'environnement validée.
 * Source : 17-infrastructure.md, 15-securite.md. Valeurs : `.env.example`.
 */
import {
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class EnvironmentVariables {
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

  @IsString()
  @IsOptional()
  S3_ENDPOINT?: string;

  @IsString()
  @IsOptional()
  S3_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  S3_SECRET_ACCESS_KEY?: string;
}