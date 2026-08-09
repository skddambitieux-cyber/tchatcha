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
  UpdateProfileCommand,
} from '../ports/user-repository.port';
import {
  ProfessionalProfileReadPort,
  ProfessionalProfileReadPortToken,
} from '../ports/professional-profile-read.port';
import {
  EventPublisherPort,
  EventPublisherPortToken,
} from '../ports/event-publisher.port';
import { UserRole } from '../../domain/entities/user-role';
import { UserStatus } from '../../domain/entities/user.entity';
import {
  AccountAnonymizedError,
  AccountLockedError,
  CategoryRequiredError,
  ConsentRequiredError,
  LocalityRequiredError,
  NoPendingOtpError,
  OtpNotVerifiedError,
  PendingOtpWriteError,
  PhoneAlreadyActiveError,
  UserNotFoundError,
  VersionConflictError,
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

/** Projection `/me` (31 §1 MeResponse + MeProfessional). */
export interface MeProfessional {
  id: string;
  business_name: string | null;
  status: string;
  verification_status: string;
  rating_avg: number;
  rating_count: number;
  trust_score: number;
  completed_jobs: number;
  location_name: string | null;
}

export interface UserMe {
  id: string;
  country_code: string;
  phone: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  locale: string;
  status: UserStatus;
  otp_verified_at: string | null;
  created_at: string;
  roles: UserRole[];
  professional: MeProfessional | null;
  deliverer: { zone: string | null; means: string | null } | null;
  /** Verrouillage optimiste (34 §2 RF-ME-W04) — relu après chaque écriture. */
  version: number;
}

/** Projection minimale d'un compte en inscription (E-ME-06, 30 §3.3). */
export type PendingOtpMe = Pick<UserMe, 'id' | 'country_code' | 'phone' | 'status'>;

const CONSENT_VERSION = 'v1';

@Injectable()
export class ProfileService {
  constructor(
    @Inject(UserRepositoryPortToken)
    private readonly users: UserRepositoryPort,
    @Inject(ProfessionalProfileReadPortToken)
    private readonly proProfiles: ProfessionalProfileReadPort,
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

  /**
 * Lecture du profil `GET /me` (6.3.1, 30 RF-ME-01…07, 31 §2, 32 §3).
 * Read-only, source d'authenticité = actorId (claims.sub du JWT).
 */
  async getMe(actorId: string): Promise<UserMe | PendingOtpMe> {
    const user = await this.users.findById(actorId);
    if (!user) {
      throw new UserNotFoundError();
    }
    if (user.anonymized_at) {
      throw new AccountAnonymizedError();
    }
    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.BANNED
    ) {
      throw new AccountLockedError();
    }

    // Projection restreinte pour un compte en inscription (E-ME-06) :
    // uniquement id, country_code, phone, status (aucune donnée personnelle).
    if (user.status === UserStatus.PENDING_OTP) {
      return {
        id: user.id,
        country_code: user.country_code,
        phone: user.phone,
        status: user.status,
      };
    }

    const roles = await this.users.findRolesById(actorId);

    return {
      id: user.id,
      country_code: user.country_code,
      phone: user.phone,
      email: user.email ?? null,
      full_name: user.full_name || null,
      avatar_url: user.avatar_url ?? null,
      locale: user.locale,
      status: user.status,
      otp_verified_at: user.otp_verified_at?.toISOString() ?? null,
      created_at: user.created_at?.toISOString() ?? '',
      roles,
      professional: roles.includes(UserRole.PROFESSIONAL)
        ? await this.mapMeProfessional(actorId)
        : null,
      deliverer: this.mapMeDeliverer(roles, user.flags),
      version: user.version,
    };
  }

  /**
 * Écriture du profil `PUT /me` (6.3.2, 34 §2-3). Remplacement total des
 * champs d'identité (RF-ME-W02), verrouillage optimiste via `version`
 * (RF-ME-W04) : version obsolète → 409 version_conflict, email dupliqué
 * → 409 email_already_registered (RF-ME-W05). Émet users.profile.updated.
 */
  async updateMe(
    actorId: string,
    input: UpdateProfileCommand,
  ): Promise<UserMe> {
    const user = await this.users.findById(actorId);
    if (!user) {
      throw new UserNotFoundError();
    }
    if (user.anonymized_at) {
      throw new AccountAnonymizedError();
    }
    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.BANNED
    ) {
      throw new AccountLockedError();
    }
    if (user.status === UserStatus.PENDING_OTP) {
      throw new PendingOtpWriteError();
    }

    const updated = await this.users.updateProfile(actorId, input);
    if (!updated) {
      throw new VersionConflictError();
    }

    this.events.publish({
      type: 'users.profile.updated',
      payload: {
        user_id: actorId,
        full_name: updated.full_name,
        locale: updated.locale,
        email: updated.email,
        avatar_url: updated.avatar_url,
        version: updated.version,
      },
    });

    const roles = await this.users.findRolesById(actorId);
    return {
      id: updated.id,
      country_code: updated.country_code,
      phone: updated.phone,
      email: updated.email ?? null,
      full_name: updated.full_name || null,
      avatar_url: updated.avatar_url ?? null,
      locale: updated.locale,
      status: updated.status,
      otp_verified_at: updated.otp_verified_at?.toISOString() ?? null,
      created_at: updated.created_at?.toISOString() ?? '',
      roles,
      professional: roles.includes(UserRole.PROFESSIONAL)
        ? await this.mapMeProfessional(actorId)
        : null,
      deliverer: this.mapMeDeliverer(roles, updated.flags),
      version: updated.version,
    };
  }

  private mapMeDeliverer(
    roles: UserRole[],
    flags: Record<string, unknown>,
  ): { zone: string | null; means: string | null } | null {
    if (!roles.includes(UserRole.DELIVERER)) return null;
    const deliverer = flags?.deliverer as
      | { zone?: unknown; means?: unknown }
      | undefined;
    if (!deliverer) return null;
    return {
      zone: typeof deliverer.zone === 'string' ? deliverer.zone : null,
      means: typeof deliverer.means === 'string' ? deliverer.means : null,
    };
  }

  private async mapMeProfessional(
    userId: string,
  ): Promise<MeProfessional | null> {
    const profile = await this.proProfiles.findByUserId(userId);
    if (!profile) {
      return null;
    }
    return {
      id: profile.id,
      business_name: profile.business_name,
      status: profile.status,
      verification_status: profile.verified
        ? 'VERIFIED'
        : 'UNVERIFIED',
      rating_avg: Number(profile.rating_avg),
      rating_count: profile.rating_count,
      trust_score: Number(profile.trust_score),
      completed_jobs: profile.completed_jobs,
      location_name: profile.location_name,
    };
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