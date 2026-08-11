/**
 * TCHATCHA — Module admin. Squelette Étape 6.1. File de modération + sanctions.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ban, ValidationTask } from './domain/entities/admin.entity';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { AdminGuard } from './interface/http/guards/admin.guard';
import { AdminVerificationsController } from './interface/http/admin-verifications.controller';
import { AdminVerificationService } from './application/services/admin-verification.service';
import { AdminVerificationRepositoryToken } from './application/ports/admin-verification-repository.port';
import { TypeOrmAdminVerificationRepository } from './infrastructure/repositories/typeorm-admin-verification.repository';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [TypeOrmModule.forFeature([ValidationTask, Ban]), AuthModule, MediaModule, ProfessionalsModule, SearchModule],
  controllers: [AdminVerificationsController],
  providers: [AdminGuard, AdminVerificationService, { provide: AdminVerificationRepositoryToken, useClass: TypeOrmAdminVerificationRepository }],
  exports: [TypeOrmModule],
})
export class AdminModule {}
