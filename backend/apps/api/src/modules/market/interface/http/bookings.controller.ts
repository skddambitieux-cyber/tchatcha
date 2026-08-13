import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
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
}
