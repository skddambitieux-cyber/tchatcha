/**
 * TCHATCHA — Module geo. Squelette Étape 6.1.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Country, Division } from './domain/entities/geo.entity';
import { GeoController } from './interface/http/geo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Country, Division])],
  controllers: [GeoController],
  exports: [TypeOrmModule],
})
export class GeoModule {}
