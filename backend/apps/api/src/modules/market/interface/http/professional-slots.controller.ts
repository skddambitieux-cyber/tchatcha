import { Controller, Get, Param, Query } from '@nestjs/common';
import { BookingService } from '../../application/services/booking.service';
import { ListSlotsDto } from './dto/booking.dto';
@Controller('professionals')
export class ProfessionalSlotsController {
  constructor(private readonly bookings: BookingService) {}
  @Get(':id/slots') slots(@Param('id') id: string, @Query() q: ListSlotsDto) {
    return this.bookings.slots(id, q);
  }
}
