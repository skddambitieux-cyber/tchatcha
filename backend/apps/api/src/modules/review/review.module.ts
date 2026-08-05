/**
 * TCHATCHA — Module review. Squelette Étape 6.1. Avis post-prestation.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review, ReviewFlag } from './domain/entities/review.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Review, ReviewFlag])],
  exports: [TypeOrmModule],
})
export class ReviewModule {}