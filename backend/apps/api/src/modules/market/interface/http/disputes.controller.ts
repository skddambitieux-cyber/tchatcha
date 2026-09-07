import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { DisputeService } from '../../application/services/dispute.service';
import { CreateDisputeDto } from './dto/dispute.dto';

@Controller('disputes')
@UseGuards(AuthGuard)
export class DisputesController {
  constructor(private readonly disputes: DisputeService) {}

  @Post()
  open(@CurrentUser() userId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateDisputeDto) {
    if (!userId) throw new UserNotFoundError();
    return this.disputes.open(userId, key, dto);
  }

  @Get(':id')
  get(@CurrentUser() userId: string | undefined, @Param('id') id: string) {
    if (!userId) throw new UserNotFoundError();
    return this.disputes.get(userId, id);
  }
}
