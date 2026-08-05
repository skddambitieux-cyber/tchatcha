/**
 * TCHATCHA — Module pay. Squelette Étape 6.1. Agnostique fournisseurs (ADR-015).
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payout, ProviderOperation, Transaction } from './domain/entities/pay.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, ProviderOperation, Payout]),
  ],
  exports: [TypeOrmModule],
})
export class PayModule {}