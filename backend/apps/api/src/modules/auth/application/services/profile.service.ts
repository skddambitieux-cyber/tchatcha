/**
 * TCHATCHA — ProfileService (28 §6). Sous-lot 3 : complète le profil
 * PENDING_OTP (OTP REGISTER vérifié), applique D5, active le compte et
 * émét la première paire de tokens (émission seule, réutilisée au login).
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  UserRepositoryPort,
  UserRepositoryPortToken,
  ActivateCommand,
} from '../ports/user-repository.port';
import {
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';
import { UserRole } from '../../domain/entities/user-role';
import { UserStatus } from '../../domain/entities/user.entity';
import {
  CategoryRequiredError,
  ConsentRequiredError,
  LocalityRequiredError,
  NoPendingOtpError,
  OtpNotVerifiedError,
  PhoneAlreadyActiveError,
  ZoneRequiredError,
} from '../../domain/errors/auth-errors';
import { AuthTokens, DeviceInfo, UserPublic } from '../types/auth.types';
import { TokenService } from './token.service';
import { normalizePhone } from './otp.service';

export interface Consents {
  cgv: boolean;
  privacy?: boolean;
  marketing?: boolean;
  location?: boolean;
}

export interface CompleteRegistrationInput {
  countryCode: string;
  phone: string;
  fullName: string;
  role: UserRole;
  consents: Consents;
  categoryId?: string;
  divisionId?: string;
  localityId?: string;
  deliveryZone?: string;
  deliveryMeans?: string;
  device: DeviceInfo;
}

export interface RegistrationResult {
  user: UserPublic;
  tokens: AuthTokens;
}

const CONSENT_VERSION = 'v1';

@Injectable()
export class ProfileService {
  constructor(
    @Inject(UserRepositoryPortToken)
    private readonly users: UserRepositoryPort,
    private readonly tokens: TokenService,
    @Inject(EventPublisherPortToken)
    private readonly events: EventPublisherPort,
  ) {}

  async completeRegistration(
    input: CompleteRegistrationInput,
  ): Promise<RegistrationResult> {
    const phone = normalizePhone(input.phone);
    const user = await this.users.findByPhone(input.countryCode, phone);
    if (!user) {
      throw new NoPendingOtpError();
    }
    if (user.status !== UserStatus.PENDING_OTP) {
      throw new PhoneAlreadyActiveError();
    }
    if (!user.otp_verified_at) {
      throw new OtpNotVerifiedError();
    }
    if (!input.consents?.cgv) {
      throw new ConsentRequiredError();
    }
    // D5 : règles par rôle, rôle verrouillé à la création.
    const activation = this.buildActivateCommand(input);

    const activated = await this.users.activateRegistration(
      user.id,
      activation,
    );

    const role = input.role;
    const userPublic: UserPublic = {
      id: activated.id,
      role,
      full_name: activated.full_name,
      phone: activated.phone,
      status: activated.status,
    };
    const tokens = await this.tokens.issuePair(userPublic, input.device);

    this.events.publish({
      type: 'auth.user.registered',
      payload: {
        user_id: activated.id,
        role,
        country_code: activated.country_code,
        phone: activated.phone,
      },
    });

    return { user: userPublic, tokens };
  }

  private buildActivateCommand(
    input: CompleteRegistrationInput,
  ): ActivateCommand {
    const consents = [
      { type: 'TOS', granted: input.consents.cgv, version: CONSENT_VERSION },
      {
        type: 'PRIVACY',
        granted: input.consents.privacy ?? false,
        version: CONSENT_VERSION,
      },
      {
        type: 'MARKETING',
        granted: input.consents.marketing ?? false,
        version: CONSENT_VERSION,
      },
      {
        type: 'LOCATION',
        granted: input.consents.location ?? false,
        version: CONSENT_VERSION,
      },
    ].filter((c) => c.granted || c.type === 'TOS');

    switch (input.role) {
      case UserRole.PROFESSIONAL:
        if (!input.categoryId) throw new CategoryRequiredError();
        if (!input.localityId) throw new LocalityRequiredError();
        return {
          fullName: input.fullName,
          role: input.role,
          consents,
          pro: {
            categoryId: input.categoryId,
            divisionId: input.divisionId ?? '',
            localityId: input.localityId,
          },
        };
      case UserRole.DELIVERER:
        if (!input.deliveryZone) throw new ZoneRequiredError();
        return {
          fullName: input.fullName,
          role: input.role,
          consents,
          deliverer: {
            deliveryZone: input.deliveryZone,
            deliveryMeans: input.deliveryMeans ?? '',
          },
        };
      default:
        return { fullName: input.fullName, role: input.role, consents };
    }
  }
}