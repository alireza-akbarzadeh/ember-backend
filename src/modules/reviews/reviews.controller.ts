import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PaginatedDto } from '../../common/dto/paginated.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.query.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';

/**
 * Two mount points rather than one prefix: a review is written against the
 * order it came from, and read against the restaurant it is about.
 */
@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('orders/:orderId/review')
  @ApiOperation({ summary: 'Review a delivered order' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviews.create(user, orderId, dto);
  }

  @Get('restaurants/:restaurantId/reviews')
  @ApiOperation({ summary: 'Reviews for a restaurant, newest first' })
  listForRestaurant(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedDto<ReviewResponseDto>> {
    return this.reviews.listForRestaurant(restaurantId, query);
  }
}
