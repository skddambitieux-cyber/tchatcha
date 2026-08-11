/**
 * TCHATCHA — Module professionals. Squelette Étape 6.1, complété 6.3.3 +
 * 6.3.4 : lecture (GET /professionals/me) + écritures de la vitrine pro
 * (PUT me, services CRUD, business_hours, location). Importe AuthModule pour
 * AuthGuard (D-ME-3, 35 §2) ; le module auth n'importe jamais ce module
 * (pas de cycle). Entités : profiles, categories (seedable), services,
 * locations, business_hours, reputation.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './domain/entities/category.entity';
import { ProfessionalProfile } from './domain/entities/professional-profile.entity';
import { ProsVerification } from './domain/entities/verification.entity';
import {
  BusinessHour,
  ProLocation,
  Service,
} from './domain/entities/professional-extras.entity';
import { Reputation } from '../media/domain/entities/media-reputation.entity';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { ProfessionalShowcaseService } from './application/services/professional-showcase.service';
import { ProfessionalVerificationService } from './application/services/professional-verification.service';
import { ProfessionalReputationService } from './application/services/professional-reputation.service';
import { ProfessionalShowcaseReadPortToken } from './application/ports/professional-showcase-read.port';
import {
  ProfessionalEventPublisherPortToken,
} from './application/ports/event-publisher.port';
import { ProfessionalShowcaseWritePortToken } from './application/ports/professional-showcase-write.port';
import { ProfessionalVerificationRepositoryToken } from './application/ports/professional-verification-repository.port';
import { ProfessionalReputationReadPortToken } from './application/ports/professional-reputation-read.port';
import { TypeOrmProfessionalShowcaseReader } from './infrastructure/repositories/typeorm-professional-showcase.reader';
import { TypeOrmProfessionalShowcaseWriter } from './infrastructure/repositories/typeorm-professional-showcase.writer';
import { TypeOrmProfessionalVerificationRepository } from './infrastructure/repositories/typeorm-professional-verification.repository';
import { TypeOrmProfessionalReputationReader } from './infrastructure/repositories/typeorm-professional-reputation.reader';
import { ConsoleProfessionalEventPublisher } from './infrastructure/events/professional-event-publisher';
import { ProfessionalsController } from './interface/http/professionals.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      ProfessionalProfile,
      Service,
      ProLocation,
      BusinessHour,
      Reputation,
      ProsVerification,
    ]),
    AuthModule,
    MediaModule,
  ],
  controllers: [ProfessionalsController],
  providers: [
    ProfessionalShowcaseService,
    ProfessionalVerificationService,
    ProfessionalReputationService,
    {
      provide: ProfessionalShowcaseReadPortToken,
      useClass: TypeOrmProfessionalShowcaseReader,
    },
    {
      provide: ProfessionalShowcaseWritePortToken,
      useClass: TypeOrmProfessionalShowcaseWriter,
    },
    {
      provide: ProfessionalEventPublisherPortToken,
      useClass: ConsoleProfessionalEventPublisher,
    },
    {
      provide: ProfessionalVerificationRepositoryToken,
      useClass: TypeOrmProfessionalVerificationRepository,
    },
    {
      provide: ProfessionalReputationReadPortToken,
      useClass: TypeOrmProfessionalReputationReader,
    },
  ],
  exports: [
    TypeOrmModule,
    ProfessionalShowcaseService,
    ProfessionalVerificationService,
    ProfessionalReputationService,
    ProfessionalVerificationRepositoryToken,
    ProfessionalEventPublisherPortToken,
  ],
})
export class ProfessionalsModule {}
