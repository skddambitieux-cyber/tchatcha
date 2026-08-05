/**
 * TCHATCHA — Module media. Squelette Étape 6.1. Fichiers génériques (06d §5).
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaFile } from './domain/entities/media-reputation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MediaFile])],
  exports: [TypeOrmModule],
})
export class MediaModule {}