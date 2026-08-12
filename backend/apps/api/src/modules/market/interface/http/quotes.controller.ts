import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { QuoteService } from '../../application/services/quote.service';
import { ListRequestsDto } from './dto/request.dto';
import { WithdrawQuoteDto } from './dto/quote.dto';

@Controller('quotes')
@UseGuards(AuthGuard)
export class QuotesController {
  constructor(private readonly quotes: QuoteService) {}

  @Get('sent')
  sent(@CurrentUser() userId: string | undefined, @Query() query: ListRequestsDto) {
    if (!userId) throw new UserNotFoundError();
    return this.quotes.listSent(userId, query.limit, query.cursor);
  }

  @Get(':id')
  detail(@CurrentUser() userId: string | undefined, @Param('id') id: string) {
    if (!userId) throw new UserNotFoundError();
    return this.quotes.detail(userId, id);
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() userId: string | undefined, @Param('id') id: string, @Body() dto: WithdrawQuoteDto) {
    if (!userId) throw new UserNotFoundError();
    return this.quotes.withdraw(userId, id, dto.version);
  }
}
