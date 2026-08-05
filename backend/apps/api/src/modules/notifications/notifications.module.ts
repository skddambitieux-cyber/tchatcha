/**
 * TCHATCHA — Module notifications. Squelette Étape 6.1 (ADR-016).
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification, NotificationTemplate } from './domain/entities/notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationTemplate])],
  exports: [TypeOrmModule],
})
export class NotificationsModule {}