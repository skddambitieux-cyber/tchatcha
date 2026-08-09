/**
 * TCHATCHA — Port : accès au compte utilisateur (module auth).
 * Satisfait par l'adaptateur TypeORM du module users (D-PORT-1) : ne duplique
 * pas users.users, utilise l'entité User du schéma `users`.
 */
import { User, UserStatus } from '../../domain/entities/user.entity';
import { OtpPurpose } from '../../domain/entities/otp-code.entity';
import { UserRole } from '../../domain/entities/user-role';

export interface ConsentsInput {
  type: string;
  granted: boolean;
  version: string;
}

/** Données d'activation register (sous-lot 3) — transaction atomique (28 §6). */
export interface ActivateCommand {
  fullName: string;
  role: UserRole;
  consents: ConsentsInput[];
  pro?: { categoryId: string; divisionId: string; localityId: string };
  deliverer?: { deliveryZone: string; deliveryMeans: string };
}

export interface UserRepositoryPort {
  findByPhone(countryCode: string, phone: string): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
  /** Rôle principal du compte (users.user_roles) — null si aucun rôle. */
  findRole(userId: string): Promise<UserRole | null>;
  /** Tous les rôles du compte (MVP : 0-1), pour la projection `/me` (32 §2). */
  findRolesById(userId: string): Promise<UserRole[]>;
  /** Crée un compte PENDING_OTP à la demande d'OTP REGISTER (D3). */
  createPending(
    countryCode: string,
    phone: string,
    purpose: OtpPurpose,
  ): Promise<User>;
  /** Marque la vérification OTP (otp_verified_at = now). */
  markOtpVerified(userId: string): Promise<void>;
  /** Bascule de statut (PENDING_OTP -> ACTIVE par register). */
  updateStatus(userId: string, status: UserStatus): Promise<void>;
  /**
   * Active le compte (PENDING_OTP → ACTIVE) de façon transactionnelle avec
   * FOR UPDATE sur la ligne user (28 §6). Écrit rôle, consentements et
   * extras par rôle. Retourne le user activé. Le rôle est verrouillé (D5).
   */
  activateRegistration(userId: string, input: ActivateCommand): Promise<User>;

  /**
   * Met à jour l'identité du compte (6.3.2, 34 §4) avec verrouillage
   * optimiste : `WHERE id AND version = expectedVersion`, puis bump
   * `version`. Retourne null si aucune ligne mise à jour (concurrence).
   * Violation d'unicité email (uq_users_email) → EmailAlreadyRegisteredError.
   */
  updateProfile(
    userId: string,
    input: UpdateProfileCommand,
  ): Promise<User | null>;
}

export interface UpdateProfileCommand {
  fullName: string;
  locale: string;
  email: string | null;
  avatarUrl: string | null;
  /** Version lue par le client (GET /me) — verrouillage optimiste (06 §6). */
  expectedVersion: number;
}

export const UserRepositoryPortToken = 'UserRepositoryPort';