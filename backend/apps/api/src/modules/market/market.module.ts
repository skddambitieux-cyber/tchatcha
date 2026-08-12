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
import { MatchedRequestsController } from './interface/http/matched-requests.controller';
import { MatchedRequestService } from './application/services/matched-request.service';
import { MatchedRequestRepositoryPortToken } from './application/ports/matched-request-repository.port';
import { TypeOrmMatchedRequestRepository } from './infrastructure/repositories/typeorm-matched-request.repository';
import { QuoteService } from './application/services/quote.service';
import { QuoteRepositoryPortToken } from './application/ports/quote-repository.port';
import { TypeOrmQuoteRepository } from './infrastructure/repositories/typeorm-quote.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceRequest, Quote, Booking, Dispute]),
    AuthModule,
  ],
  controllers: [MatchedRequestsController, RequestsController],
  providers: [
    RequestService,
    MatchedRequestService,
    QuoteService,
    { provide: RequestRepositoryPortToken, useClass: TypeOrmRequestRepository },
    { provide: MatchedRequestRepositoryPortToken, useClass: TypeOrmMatchedRequestRepository },
    { provide: QuoteRepositoryPortToken, useClass: TypeOrmQuoteRepository },
  ],
  exports: [TypeOrmModule],
})
export class MarketModule {}
