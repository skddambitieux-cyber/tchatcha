import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { RequestService } from '../../application/services/request.service';
import { CancelRequestDto, ListRequestsDto, PublishRequestDto } from './dto/request.dto';
import { CreateQuoteDto } from './dto/quote.dto';
import { QuoteService } from '../../application/services/quote.service';

@Controller('requests')
@UseGuards(AuthGuard)
export class RequestsController {
  constructor(private readonly requests: RequestService, private readonly quotes: QuoteService) {}

  @Post()
  publish(@CurrentUser() userId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() dto: PublishRequestDto) {
    if (!userId) throw new UserNotFoundError();
    return this.requests.publish(userId, key, dto);
  }

  @Get()
  list(@CurrentUser() userId: string | undefined, @Query() query: ListRequestsDto) {
    if (!userId) throw new UserNotFoundError();
    return this.requests.listMine(userId, query.limit, query.cursor);
  }

  @Post(':id/quotes')
  createQuote(@CurrentUser() userId: string | undefined, @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateQuoteDto) {
    if (!userId) throw new UserNotFoundError();
    return this.quotes.create(userId, id, key, dto);
  }

  @Get(':id/quotes')
  receivedQuotes(@CurrentUser() userId: string | undefined, @Param('id') id: string,
    @Query() query: ListRequestsDto) {
    if (!userId) throw new UserNotFoundError();
    return this.quotes.listReceived(userId, id, query.limit, query.cursor);
  }

  @Get(':id')
  detail(@CurrentUser() userId: string | undefined, @Param('id') id: string) {
    if (!userId) throw new UserNotFoundError();
    return this.requests.getMine(userId, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() userId: string | undefined, @Param('id') id: string, @Body() dto: CancelRequestDto) {
    if (!userId) throw new UserNotFoundError();
    return this.requests.cancel(userId, id, dto.reason, dto.version);
  }
}
