/**
 * TCHATCHA — Controller `GET /me` (lot 6.3.1, docs/31-api-contracts-users.md §2).
 * Profil du compte connecté, authentifié par AuthGuard (Bearer).
 * Réponses : 200 UserMe / 401 unauthorized, token_expired / 403 account_locked,
 * resource_unavailable — mappées par AuthExceptionsFilter.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ProfileService } from '../../application/services/profile.service';
import { AuthGuard } from './guards/auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserNotFoundError } from '../../domain/errors/auth-errors';

@Controller('me')
export class MeController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() userId?: string) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.profileService.getMe(userId);
  }
}