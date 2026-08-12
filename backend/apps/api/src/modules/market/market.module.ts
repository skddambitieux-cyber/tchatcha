/**
 * TCHATCHA — Module market. Squelette Étape 6.1. Cœur du Mode B.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRequest } from './domain/entities/service-request.entity';
import { Quote } from './domain/entities/quote.entity';
import { Booking, Dispute } from './domain/entities/booking-dispute.entity';
import { AuthModule } from '../auth/auth.module';
import { RequestsController } from './interface/http/requests.controller';
import { RequestService } from './application/services/request.service';
import { RequestRepositoryPortToken } from './application/ports/request-repository.port';
import { TypeOrmRequestRepository } from './infrastructure/repositories/typeorm-request.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceRequest, Quote, Booking, Dispute]),
    AuthModule,
  ],
  controllers: [RequestsController],
  providers: [RequestService, { provide: RequestRepositoryPortToken, useClass: TypeOrmRequestRepository }],
  exports: [TypeOrmModule],
})
export class MarketModule {}
