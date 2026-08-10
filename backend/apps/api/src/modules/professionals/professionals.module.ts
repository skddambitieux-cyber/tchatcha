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
import {
  BusinessHour,
  ProLocation,
  Service,
} from './domain/entities/professional-extras.entity';
import { Reputation } from '../media/domain/entities/media-reputation.entity';
import { AuthModule } from '../auth/auth.module';
import { ProfessionalShowcaseService } from './application/services/professional-showcase.service';
import { ProfessionalShowcaseReadPortToken } from './application/ports/professional-showcase-read.port';
import {
  ProfessionalEventPublisherPortToken,
} from './application/ports/event-publisher.port';
import { ProfessionalShowcaseWritePortToken } from './application/ports/professional-showcase-write.port';
import { TypeOrmProfessionalShowcaseReader } from './infrastructure/repositories/typeorm-professional-showcase.reader';
import { TypeOrmProfessionalShowcaseWriter } from './infrastructure/repositories/typeorm-professional-showcase.writer';
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
    ]),
    AuthModule,
  ],
  controllers: [ProfessionalsController],
  providers: [
    ProfessionalShowcaseService,
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
  ],
  exports: [TypeOrmModule],
})
export class ProfessionalsModule {}