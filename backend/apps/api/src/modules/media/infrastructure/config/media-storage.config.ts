/**
 * TCHATCHA — Configuration du stockage objet (37 §4).
 * Lue depuis la config d'environnement validée (env.validation.ts, variables
 * optionnelles avec défauts MinIO dev). Les buckets sont requis au runtime
 * (presign) — pas de blocage au boot.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MediaStorageConfigShape {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketPublic: string;
  bucketPrivate: string;
  forcePathStyle: boolean;
  presignTtlSeconds: number;
  /** URL publique du bucket (RF-MD-01 : MinIO {endpoint}/{bucket}, R2 CDN). */
  publicUrlBase: string;
}

@Injectable()
export class MediaStorageConfig {
  constructor(private readonly config: ConfigService) {}

  get(): MediaStorageConfigShape {
    const endpoint = this.config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000';
    const bucketPublic =
      this.config.get<string>('S3_BUCKET_PUBLIC') ?? 'tchatcha';
    return {
      endpoint,
      region: this.config.get<string>('S3_REGION') ?? 'auto',
      accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID') ?? 'minioadmin',
      secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY') ?? '',
      bucketPublic,
      bucketPrivate:
        this.config.get<string>('S3_BUCKET_PRIVATE') ?? 'tchatcha-private',
      forcePathStyle:
        (this.config.get<string>('S3_FORCE_PATH_STYLE') ?? 'true') === 'true',
      presignTtlSeconds: Number(
        this.config.get<string>('S3_PRESIGN_TTL_SECONDS') ?? '900',
      ),
      publicUrlBase:
        (this.config.get<string>('S3_PUBLIC_URL_BASE') ??
          `${endpoint}/${bucketPublic}`.replace(/\/+$/u, '')) as string,
    };
  }
}
