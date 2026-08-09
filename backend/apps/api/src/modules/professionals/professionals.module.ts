/**
 * TCHATCHA — Module professionals. Squelette Étape 6.1, complété 6.3.3 :
 * lecture de la vitrine pro (GET /professionals/me). Importe AuthModule pour
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
import { TypeOrmProfessionalShowcaseReader } from './infrastructure/repositories/typeorm-professional-showcase.reader';
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
  ],
  exports: [TypeOrmModule],
})
export class ProfessionalsModule {}