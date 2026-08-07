/**
 * TCHATCHA — DTO POST /api/v1/auth/logout (27-api-contracts-auth.md §7).
 */
import { IsString } from 'class-validator';

export class LogoutDto {
  @IsString()
  refresh_token: string;
}