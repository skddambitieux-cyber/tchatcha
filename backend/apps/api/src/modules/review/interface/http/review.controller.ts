import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../auth/interface/http/guards/auth.guard';
import { CurrentUser } from '../../../auth/interface/http/decorators/current-user.decorator';
import { UserNotFoundError } from '../../../auth/domain/errors/auth-errors';
import { ReviewService } from '../../application/services/review.service';
import { CreateReviewDto, ModerateReviewDto, ReportReviewDto, RespondReviewDto, UpdateReviewDto } from './dto/review.dto';
import { AdminGuard } from '../../../admin/interface/http/guards/admin.guard';

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

  @Post(':id/report')
  report(@CurrentUser() userId: string | undefined, @Param('id') id: string, @Headers('idempotency-key') key: string | undefined, @Body() dto: ReportReviewDto) {
    if (!userId) throw new UserNotFoundError();
    return this.reviews.report(userId, id, key, dto);
  }
}

@Controller('admin/reviews')
@UseGuards(AdminGuard)
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  list(@Query('status') status = 'OPEN') {
    return this.reviews.listModeration(status);
  }

  @Post(':id/moderate')
  @HttpCode(HttpStatus.OK)
  moderate(@CurrentUser() adminId: string | undefined, @Param('id') id: string, @Body() dto: ModerateReviewDto) {
    if (!adminId) throw new UserNotFoundError();
    return this.reviews.moderate(adminId, id, dto);
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
