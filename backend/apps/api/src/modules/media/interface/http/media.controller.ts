/**
 * TCHATCHA — Controller media (37 §3.1). POST /media/presign : URL d'upload
 * présignée PUT vers le bucket public (ADR-007) — le backend ne reçoit jamais
 * le fichier. AuthGuard/@CurrentUser depuis le module auth (D-ME-3).
 * Réponses : 201 / 401 / 403 / 404 / 410 / 422.
 */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { MediaFileService } from '../../application/media-file.service';
import { PresignMediaDto } from './dto/presign-media.dto';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaFileService) {}

  @Post('presign')
  @UseGuards(AuthGuard)
  presign(
    @CurrentUser() userId?: string,
    @Body() dto: PresignMediaDto = new PresignMediaDto(),
  ) {
    if (!userId) {
      throw new UserNotFoundError();
    }
    return this.media.presign(userId, {
      purpose: dto.purpose,
      mimeType: dto.mime_type,
      sizeBytes: dto.size_bytes,
      width: dto.width ?? null,
      height: dto.height ?? null,
      durationSec: dto.duration_sec ?? null,
    });
  }
}
