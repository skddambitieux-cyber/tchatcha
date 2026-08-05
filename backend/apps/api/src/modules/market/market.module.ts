/**
 * TCHATCHA — Module market. Squelette Étape 6.1. Cœur du Mode B.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRequest } from './domain/entities/service-request.entity';
import { Quote } from './domain/entities/quote.entity';
import { Booking, Dispute } from './domain/entities/booking-dispute.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceRequest, Quote, Booking, Dispute]),
  ],
  exports: [TypeOrmModule],
})
export class MarketModule {}