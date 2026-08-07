/**
 * TCHATCHA — Types partagés du module auth (27-api-contracts-auth.md §1).
 */
import { UserRole } from '../../domain/entities/user-role';
import { UserStatus } from '../../domain/entities/user.entity';

export interface UserPublic {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string;
  status: UserStatus;
}

export interface AuthTokens {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}

export interface DeviceInfo {
  session_id: string;
  user_agent?: string;
  ip?: string;
}
