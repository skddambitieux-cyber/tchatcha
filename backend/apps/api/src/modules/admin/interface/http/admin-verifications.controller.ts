import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { AdminVerificationService } from '../../application/services/admin-verification.service';
import { AdminGuard } from './guards/admin.guard';
import { AdminVerificationQueryDto, DecideVerificationDto } from './dto/admin-verification.dto';

@Controller('admin/verifications')
@UseGuards(AdminGuard)
export class AdminVerificationsController {
  constructor(private readonly service: AdminVerificationService) {}
  @Get()
  list(@Query() query: AdminVerificationQueryDto) {
    return this.service.list(query.status, query.page, query.limit);
  }
  @Put(':id/decide')
  decide(@CurrentUser() adminId: string | undefined, @Param('id') id: string, @Body() dto: DecideVerificationDto) {
    if (!adminId) throw new UserNotFoundError();
    return this.service.decide(id, adminId, dto.approve, dto.reason);
  }
}
