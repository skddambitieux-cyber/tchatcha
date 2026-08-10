/**
 * TCHATCHA — Module media. 6.3.5a (37 §4) : StoragePort S3 (MinIO/R2,
 * ADR-007), lignes media.files (PROCESSING → READY/FAILED) et presign
 * POST /media/presign. Le module professionals importe MediaModule pour les
 * commandes portfolio (confirm/update/delete/list) — jamais l'inverse.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaFile } from './domain/entities/media-reputation.entity';
import { AuthModule } from '../auth/auth.module';
import { StoragePortToken } from './domain/ports/storage.port';
import { MediaFileRepositoryToken } from './domain/ports/media-file-repository.port';
import { MediaFileService } from './application/media-file.service';
import { TypeOrmMediaFileRepository } from './infrastructure/repositories/typeorm-media-file.repository';
import { S3StorageAdapter } from './infrastructure/storage/s3-storage.adapter';
import { MediaStorageConfig } from './infrastructure/config/media-storage.config';
import { MediaController } from './interface/http/media.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaFile]),
    AuthModule,
  ],
  controllers: [MediaController],
  providers: [
    MediaFileService,
    MediaStorageConfig,
    {
      provide: StoragePortToken,
      useClass: S3StorageAdapter,
    },
    {
      provide: MediaFileRepositoryToken,
      useClass: TypeOrmMediaFileRepository,
    },
  ],
  exports: [
    TypeOrmModule,
    MediaFileService,
    MediaStorageConfig,
  ],
})
export class MediaModule {}
