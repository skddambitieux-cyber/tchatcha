/**
 * TCHATCHA — Module admin. Squelette Étape 6.1. File de modération + sanctions.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ban, ValidationTask } from './domain/entities/admin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ValidationTask, Ban])],
  exports: [TypeOrmModule],
})
export class AdminModule {}