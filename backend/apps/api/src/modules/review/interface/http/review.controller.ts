import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { ReviewService } from '../../application/services/review.service';
import { CreateReviewDto, RespondReviewDto, UpdateReviewDto } from './dto/review.dto';

@Controller('reviews')
@UseGuards(AuthGuard)
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}
  @Post()
  create(@CurrentUser() userId: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreateReviewDto) {
    if (!userId) throw new UserNotFoundError();
    return this.reviews.create(userId, key, dto);
  }

  @Patch(':id')
  update(@CurrentUser() userId: string | undefined, @Param('id') id: string, @Body() dto: UpdateReviewDto) {
    if (!userId) throw new UserNotFoundError();
    return this.reviews.update(userId, id, dto);
  }

  @Post(':id/respond')
  respond(@CurrentUser() userId: string | undefined, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() dto: RespondReviewDto) {
    if (!userId) throw new UserNotFoundError();
    return this.reviews.respond(userId, id, key, dto);
  }
}

@Controller('professionals')
export class ProfessionalReviewsController {
  constructor(private readonly reviews: ReviewService) {}
  @Get(':id/reviews')
  list(@Param('id') id: string, @Query('limit', new ParseIntPipe({ optional: true })) limit?: number, @Query('cursor') cursor?: string) {
    return this.reviews.list(id, limit ?? 20, cursor);
  }
}
