/**
 * TCHATCHA — Port : accès au compte utilisateur (module auth).
 * Satisfait par l'adaptateur TypeORM du module users (D-PORT-1) : ne duplique
 * pas users.users, utilise l'entité User du schéma `users`.
 */
import { User, UserStatus } from '../../domain/entities/user.entity';
import { OtpPurpose } from '../../domain/entities/otp-code.entity';

export interface UserRepositoryPort {
  findByPhone(countryCode: string, phone: string): Promise<User | null>;
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
}

export const UserRepositoryPortToken = 'UserRepositoryPort';