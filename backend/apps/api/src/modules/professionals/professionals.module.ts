/**
 * TCHATCHA — Module professionals. Squelette Étape 6.1.
 * Domaines : profiles, categories (seedable), services, locations,
 * business_hours, reputation, verifications.
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
  ],
  exports: [TypeOrmModule],
})
export class ProfessionalsModule {}