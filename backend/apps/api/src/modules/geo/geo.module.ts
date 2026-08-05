/**
 * TCHATCHA — Module geo. Squelette Étape 6.1.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Country, Division } from './domain/entities/geo.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Country, Division])],
  exports: [TypeOrmModule],
})
export class GeoModule {}