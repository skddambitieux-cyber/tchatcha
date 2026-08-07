/**
 * TCHATCHA — Module auth (lot 6.2, sous-lot 3 : register).
 * Hexagonal : services dépendent des ports ; adapters injectés ici.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './domain/entities/user.entity';
import { OtpCode } from './domain/entities/otp-code.entity';
import { RefreshToken } from './domain/entities/refresh-token.entity';
import { Consent } from '../users/domain/entities/consent.entity';
import { UserRoleEntity } from '../users/domain/entities/user-role.entity';
import { ProfessionalProfile } from '../professionals/domain/entities/professional-profile.entity';
import { OtpStorePortToken } from './application/ports/otp-store.port';
import { OtpSenderPortToken } from './application/ports/otp-sender.port';
import { ClockPortToken } from './application/ports/clock.port';
import { UserRepositoryPortToken } from './application/ports/user-repository.port';
import { OtpAuditRepositoryPortToken } from './application/ports/otp-audit-repository.port';
import { TokenManagerPortToken } from './application/ports/token-manager.port';
import { SessionRepositoryPortToken } from './application/ports/session-repository.port';
import { EventPublisherPortToken } from './application/ports/event-publisher.port';
import { OtpService } from './application/services/otp.service';
import { TokenService } from './application/services/token.service';
import { LoginService } from './application/services/login.service';
import { ProfileService } from './application/services/profile.service';
import { InMemoryOtpStore } from './infrastructure/persistence/in-memory-otp.store';
import { ConsoleSmsProvider } from './infrastructure/providers/console-sms.provider';
import { SystemClock } from './infrastructure/clock/system-clock';
import { TypeOrmUserRepository } from './infrastructure/repositories/typeorm-user.repository';
import { TypeOrmOtpAuditRepository } from './infrastructure/repositories/typeorm-otp-audit.repository';
import { TypeOrmSessionRepository } from './infrastructure/repositories/typeorm-session.repository';
import { JwtAdapter } from './infrastructure/tokens/jwt.adapter';
import { ConsoleEventPublisher } from './infrastructure/events/console-event-publisher';
import { AuthController } from './interface/http/auth.controller';
import { AuthExceptionsFilter } from './interface/http/filters/auth-exceptions.filter';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      OtpCode,
      RefreshToken,
      Consent,
      UserRoleEntity,
      ProfessionalProfile,
    ]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    OtpService,
    TokenService,
    LoginService,
    ProfileService,
    { provide: APP_FILTER, useClass: AuthExceptionsFilter },
    { provide: OtpStorePortToken, useClass: InMemoryOtpStore },
    { provide: OtpSenderPortToken, useClass: ConsoleSmsProvider },
    { provide: ClockPortToken, useClass: SystemClock },
    { provide: UserRepositoryPortToken, useClass: TypeOrmUserRepository },
    { provide: OtpAuditRepositoryPortToken, useClass: TypeOrmOtpAuditRepository },
    { provide: TokenManagerPortToken, useClass: JwtAdapter },
    { provide: SessionRepositoryPortToken, useClass: TypeOrmSessionRepository },
    { provide: EventPublisherPortToken, useClass: ConsoleEventPublisher },
  ],
  exports: [TypeOrmModule],
})
export class AuthModule {}