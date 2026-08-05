/**
 * TCHATCHA — Module users. Squelette Étape 6.1.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRoleEntity } from './domain/entities/user-role.entity';
import { Device } from './domain/entities/device.entity';
import { Address } from './domain/entities/address.entity';
import { Consent } from './domain/entities/consent.entity';
import { Favorite } from './domain/entities/favorite.entity';
import { UserSettings } from './domain/entities/user-settings.entity';
import { User } from '../auth/domain/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserRoleEntity,
      Device,
      Address,
      Consent,
      Favorite,
      UserSettings,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class UsersModule {}