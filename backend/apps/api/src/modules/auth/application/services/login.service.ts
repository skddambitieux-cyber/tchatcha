/**
 * TCHATCHA — LoginService (sous-lot 4, 27 §4, 28 §3).
 * `login` = alias de `otp/verify`(LOGIN) : vérifie le code, refuse les comptes
 * non ACTIVE (403 account_locked, message générique), émet la session
 * (TokenService, réutilisé du sous-lot 3) et publie auth.user.logged_in.
 */
import { Inject, Injectable } from '@nestjs/common';
import { OtpPurpose } from '../../domain/entities/otp-code.entity';
import { UserStatus } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/entities/user-role';
import {
  AccountLockedError,
  NoPendingOtpError,
} from '../../domain/errors/auth-errors';
import {
  UserRepositoryPort,
  UserRepositoryPortToken,
} from '../ports/user-repository.port';
import {
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';
import { AuthTokens, DeviceInfo, UserPublic } from '../types/auth.types';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

export interface LoginInput {
  countryCode: string;
  phone: string;
  code: string;
  device: DeviceInfo;
}

export interface LoginResult {
  user: UserPublic;
  tokens: AuthTokens;
}

@Injectable()
export class LoginService {
  constructor(
    private readonly otp: OtpService,
    @Inject(UserRepositoryPortToken)
    private readonly users: UserRepositoryPort,
    private readonly tokens: TokenService,
    @Inject(EventPublisherPortToken)
    private readonly events: EventPublisherPort,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const verified = await this.otp.verify({
      countryCode: input.countryCode,
      phone: input.phone,
      code: input.code,
      purpose: OtpPurpose.LOGIN,
    });
    if (!verified.userId) {
      throw new NoPendingOtpError();
    }

    const user = await this.users.findById(verified.userId);
    if (!user) {
      throw new NoPendingOtpError();
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new AccountLockedError();
    }

    const role = (await this.users.findRole(user.id)) ?? UserRole.CLIENT;
    const userPublic: UserPublic = {
      id: user.id,
      role,
      full_name: user.full_name,
      phone: user.phone,
      status: user.status,
    };

    const tokens = await this.tokens.issuePair(userPublic, input.device);

    this.events.publish({
      type: 'auth.user.logged_in',
      payload: {
        user_id: user.id,
        role,
        device_id: input.device.session_id,
        ip: input.device.ip ?? null,
        ts: new Date().toISOString(),
      },
    });

    return { user: userPublic, tokens };
  }
}