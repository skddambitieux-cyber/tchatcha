/**
 * TCHATCHA — Module applicatif racine (monolithe modulaire — ADR-001).
 * Assemble : config validée + base (TypeORM) + modules de domaine (squelettes).
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EnvironmentVariables } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './shared/health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GeoModule } from './modules/geo/geo.module';
import { ProfessionalsModule } from './modules/professionals/professionals.module';
import { MarketModule } from './modules/market/market.module';
import { PayModule } from './modules/pay/pay.module';
import { ReviewModule } from './modules/review/review.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { MediaModule } from './modules/media/media.module';

async function envValidate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = await validate(validated, { whitelist: true });
  if (errors.length > 0) {
    throw new Error(`Configuration invalide: ${errors.join(', ')}`);
  }
  return validated;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validate: envValidate,
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    GeoModule,
    ProfessionalsModule,
    MarketModule,
    PayModule,
    ReviewModule,
    MessagingModule,
    NotificationsModule,
    AdminModule,
    AuditModule,
    MediaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}