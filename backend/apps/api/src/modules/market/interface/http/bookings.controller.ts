import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { BookingService } from '../../application/services/booking.service';
import { CreateBookingDto } from './dto/booking.dto';
@Controller('bookings')
@UseGuards(AuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingService) {}
  @Post() create(
    @CurrentUser() userId: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateBookingDto,
  ) {
    if (!userId) throw new UserNotFoundError();
    return this.bookings.create(userId, key, dto);
  }
  /** FCT-014 — double confirmation (client/pro, US-034/060). */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() userId: string | undefined, @Param('id') id: string) {
    if (!userId) throw new UserNotFoundError();
    return this.bookings.confirm(userId, id);
  }
}
