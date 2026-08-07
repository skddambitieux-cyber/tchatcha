/**
 * TCHATCHA — Module auth (lot 6.2, sous-lot 1 : request-otp).
 * Hexagonal : OtpService dépend des ports ; adapters injectés ici.
 */
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './domain/entities/user.entity';
import { OtpCode } from './domain/entities/otp-code.entity';
import { RefreshToken } from './domain/entities/refresh-token.entity';
import { OtpStorePortToken } from './application/ports/otp-store.port';
import { OtpSenderPortToken } from './application/ports/otp-sender.port';
import { ClockPortToken } from './application/ports/clock.port';
import { UserRepositoryPortToken } from './application/ports/user-repository.port';
import { OtpAuditRepositoryPortToken } from './application/ports/otp-audit-repository.port';
import { OtpService } from './application/services/otp.service';
import { InMemoryOtpStore } from './infrastructure/persistence/in-memory-otp.store';
import { ConsoleSmsProvider } from './infrastructure/providers/console-sms.provider';
import { SystemClock } from './infrastructure/clock/system-clock';
import { TypeOrmUserRepository } from './infrastructure/repositories/typeorm-user.repository';
import { TypeOrmOtpAuditRepository } from './infrastructure/repositories/typeorm-otp-audit.repository';
import { AuthController } from './interface/http/auth.controller';
import { AuthExceptionsFilter } from './interface/http/filters/auth-exceptions.filter';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OtpCode, RefreshToken]),
  ],
  controllers: [AuthController],
  providers: [
    OtpService,
    { provide: APP_FILTER, useClass: AuthExceptionsFilter },
    { provide: OtpStorePortToken, useClass: InMemoryOtpStore },
    { provide: OtpSenderPortToken, useClass: ConsoleSmsProvider },
    { provide: ClockPortToken, useClass: SystemClock },
    { provide: UserRepositoryPortToken, useClass: TypeOrmUserRepository },
    { provide: OtpAuditRepositoryPortToken, useClass: TypeOrmOtpAuditRepository },
  ],
  exports: [TypeOrmModule],
})
export class AuthModule {}
