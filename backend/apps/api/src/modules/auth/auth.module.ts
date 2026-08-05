/**
 * TCHATCHA — Module auth. Squelette Étape 6.1 : enregistrement des entities.
 * Les use-cases (OTP, connexion, refresh) seront ajoutés à l'Étape 6.2.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './domain/entities/user.entity';
import { OtpCode } from './domain/entities/otp-code.entity';
import { RefreshToken } from './domain/entities/refresh-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OtpCode, RefreshToken]),
  ],
  exports: [TypeOrmModule],
})
export class AuthModule {}