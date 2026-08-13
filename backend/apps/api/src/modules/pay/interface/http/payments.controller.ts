/**
 * TCHATCHA — Controller paiements client (FCT-013, 12-api-blueprint.md §10).
 * Endpoints authentifiés : initiate (Idempotency-Key), verify, GET /:id.
 * Tiers : lecture/manipulation limitées au propriétaire (404 sinon).
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { PayService } from '../../application/services/pay.service';
import { InitiatePaymentDto, VerifyPaymentDto } from './dto/pay.dto';

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly pay: PayService) {}
  @Post('initiate') initiate(
    @CurrentUser() userId: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: InitiatePaymentDto,
  ) {
    if (!userId) throw new UserNotFoundError();
    return this.pay.initiate(userId, key, dto.booking_id);
  }
  @Post(':id/verify') @HttpCode(HttpStatus.OK) verify(
    @CurrentUser() userId: string | undefined,
    @Param('id') id: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    if (!userId) throw new UserNotFoundError();
    return this.pay.verify(userId, id, dto.code);
  }
  @Get(':id') get(
    @CurrentUser() userId: string | undefined,
    @Param('id') id: string,
  ) {
    if (!userId) throw new UserNotFoundError();
    return this.pay.get(userId, id);
  }
}