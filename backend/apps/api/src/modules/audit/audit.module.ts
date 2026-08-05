/**
 * TCHATCHA — Module audit. Squelette Étape 6.1. Outbox + journal d'événements.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AggregateEvent, AuditLog, OutboxEvent } from './domain/entities/audit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent, AggregateEvent, AuditLog])],
  exports: [TypeOrmModule],
})
export class AuditModule {}