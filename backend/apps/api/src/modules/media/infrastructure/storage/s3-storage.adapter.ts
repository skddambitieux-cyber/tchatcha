/**
 * TCHATCHA — S3StorageAdapter (37 §4, ADR-007).
 * Implémentation StoragePort par protocole S3 : Cloudflare R2 en prod, MinIO
 * en dev (endpoint + forcePathStyle), AWS/GCS compatibles. Signature locale
 * (aucun réseau) au presign ; HeadObject/DeleteObject via le client S3.
 * Le PUT est effectué directement par le client vers l'URL présignée — le
 * backend ne voit jamais les octets.
 */
import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ObjectMeta,
  PresignUploadInput,
  PresignReadInput,
  PresignUploadResult,
  StorageBucket,
  StoragePort,
} from '../../domain/ports/storage.port';
import { MediaStorageConfig } from '../config/media-storage.config';

@Injectable()
export class S3StorageAdapter implements StoragePort {
  private readonly client: S3Client;
  private readonly config: MediaStorageConfig['get'];

  constructor(storageConfig: MediaStorageConfig) {
    this.config = storageConfig.get.bind(storageConfig);
    const cfg = this.config();
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async presignUpload(input: PresignUploadInput): Promise<PresignUploadResult> {
    const cfg = this.config();
    if (!cfg.secretAccessKey) {
      throw new Error('S3_SECRET_ACCESS_KEY manquante (configuration stockage)');
    }
    const bucket = this.bucketFor(input.bucket);
    // ContentType + ContentLength signés : toute incohérence au PUT est
    // rejetée par S3 (SignatureDoesNotMatch) — verrou technique (RF-MD-02/03).
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: cfg.presignTtlSeconds,
    });
    return { url, expiresIn: cfg.presignTtlSeconds };
  }

  async presignRead(input: PresignReadInput): Promise<PresignUploadResult> {
    const cfg = this.config();
    if (!cfg.secretAccessKey) {
      throw new Error('S3_SECRET_ACCESS_KEY manquante (configuration stockage)');
    }
    const command = new GetObjectCommand({
      Bucket: this.bucketFor(input.bucket),
      Key: input.key,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: cfg.presignTtlSeconds,
    });
    return { url, expiresIn: cfg.presignTtlSeconds };
  }

  async headObject(key: string, bucket: StorageBucket): Promise<ObjectMeta | null> {
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketFor(bucket), Key: key }),
      );
      return {
        sizeBytes: out.ContentLength ?? 0,
        contentType: out.ContentType ?? '',
      };
    } catch (err) {
      // 404 / NoSuchKey → objet absent (confirm 410, RF-MD-06).
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      if (status === 404) {
        return null;
      }
      throw err;
    }
  }

  async deleteObject(key: string, bucket: StorageBucket): Promise<void> {
    // NoSuchKey ignoré (RF-MD-07, RF-PW-P03) : suppression idempotente.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucketFor(bucket), Key: key }),
    );
  }

  private bucketFor(bucket: StorageBucket): string {
    const cfg = this.config();
    const name = bucket === 'public' ? cfg.bucketPublic : cfg.bucketPrivate;
    if (!name) {
      throw new Error(`Bucket ${bucket} non configuré (S3_BUCKET_*)`);
    }
    return name;
  }
}
