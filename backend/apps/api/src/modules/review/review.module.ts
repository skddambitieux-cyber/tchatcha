/**
 * TCHATCHA — Module review. Squelette Étape 6.1. Avis post-prestation.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review, ReviewFlag, ProfessionalReviewStats } from './domain/entities/review.entity';
import { ReviewController, ProfessionalReviewsController } from './interface/http/review.controller';
import { ReviewService } from './application/services/review.service';
import { ReviewRepositoryPortToken } from './application/ports/review-repository.port';
import { TypeOrmReviewRepository } from './infrastructure/repositories/typeorm-review.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Review, ReviewFlag, ProfessionalReviewStats]), AuthModule],
  controllers: [ReviewController, ProfessionalReviewsController],
  providers: [ReviewService, { provide: ReviewRepositoryPortToken, useClass: TypeOrmReviewRepository }],
  exports: [TypeOrmModule, ReviewService],
})
export class ReviewModule {}
