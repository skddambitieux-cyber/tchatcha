/**
 * TCHATCHA — Controller `/me` (lot 6.3.1 GET + 6.3.2 PUT, docs/31 §2, 34 §3).
 * Profil du compte connecté, authentifié par AuthGuard (Bearer).
 * Réponses GET : 200 UserMe / 401 / 403 — mappées par AuthExceptionsFilter.
 * Réponses PUT : 200 / 400 / 401 / 403 / 409 (email_already_registered,
 * version_conflict, state_conflict) — docs/34-cadrage-users-lot-6-3-2.md §3.
 */
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ProfileService } from '../../application/services/profile.service';
import { AuthGuard } from './guards/auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserNotFoundError } from '../../domain/errors/auth-errors';
import { UpdateMeDto } from './dto/update-me.dto';

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

  @Put()
  @UseGuards(AuthGuard)
  updateMe(@CurrentUser() userId?: string, @Body() dto: UpdateMeDto) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.profileService.updateMe(userId, {
      fullName: dto.full_name,
      locale: dto.locale,
      email: dto.email ?? null,
      avatarUrl: dto.avatar_url ?? null,
      expectedVersion: dto.version,
    });
  }
}