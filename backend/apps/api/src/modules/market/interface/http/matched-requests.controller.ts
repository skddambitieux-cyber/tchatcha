import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { MatchedRequestService } from '../../application/services/matched-request.service';
import { ListRequestsDto } from './dto/request.dto';

@Controller('requests/matched')
@UseGuards(AuthGuard)
export class MatchedRequestsController {
  constructor(private readonly matchedRequests: MatchedRequestService) {}

  @Get()
  list(@CurrentUser() userId: string | undefined, @Query() query: ListRequestsDto) {
    if (!userId) throw new UserNotFoundError();
    return this.matchedRequests.list(userId, query.limit, query.cursor);
  }

  @Get(':id')
  detail(@CurrentUser() userId: string | undefined, @Param('id') id: string) {
    if (!userId) throw new UserNotFoundError();
    return this.matchedRequests.detail(userId, id);
  }
}
