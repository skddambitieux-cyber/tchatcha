/**
 * TCHATCHA — Controller `GET /professionals/me` (lot 6.3.3, docs/35 §3).
 * Vitrine pro du propriétaire authentifié. AuthGuard et @CurrentUser
 * importés depuis le module auth (D-ME-3, 32 §8), AuthModule exporté.
 * Réponses : 200 / 401 / 403 / 404 professional_not_found (RF-PW02).
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { ProfessionalShowcaseService } from '../../application/services/professional-showcase.service';

@Controller('professionals')
export class ProfessionalsController {
  constructor(
    private readonly showcaseService: ProfessionalShowcaseService,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@CurrentUser() userId?: string) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.showcaseService.getMe(userId);
  }
}