import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { QuoteService } from '../../application/services/quote.service';
import { ListRequestsDto } from './dto/request.dto';
import { CounterOfferDto, WithdrawQuoteDto } from './dto/quote.dto';

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

  @Post(':id/counter-offers')
  counter(@CurrentUser() userId: string | undefined, @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined, @Body() dto: CounterOfferDto) {
    if (!userId) throw new UserNotFoundError();
    return this.quotes.counter(userId, id, key, dto);
  }

  @Get(':id/history')
  history(@CurrentUser() userId: string | undefined, @Param('id') id: string) {
    if (!userId) throw new UserNotFoundError();
    return this.quotes.history(userId, id);
  }
}
