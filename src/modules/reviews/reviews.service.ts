import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { paginate, type PaginatedDto } from '../../common/dto/paginated.dto';
import type { PaginationQueryDto } from '../../common/dto/pagination.query.dto';
import { isUniqueViolation } from '../../database/database.errors';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { ReviewsRepository } from './reviews.repository';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviews: ReviewsRepository,
    private readonly orders: OrdersService,
    private readonly restaurants: RestaurantsService,
  ) {}

  /**
   * Reviews the order, then refreshes the restaurant's rating.
   *
   * Three gates, in order of what they protect: you must be involved in the
   * order at all (404), you must be the customer rather than the courier or
   * the kitchen (403), and the food must actually have arrived (409).
   */
  async create(
    user: AuthenticatedUser,
    orderId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    // Throws 404 for anyone uninvolved, so a stranger cannot probe order ids.
    const order = await this.orders.getById(user, orderId);

    if (order.customerId !== user.id) {
      throw new ForbiddenException('Only the customer who placed an order can review it');
    }

    if (order.status !== 'delivered') {
      throw new ConflictException('An order can be reviewed once it has been delivered');
    }

    try {
      const review = await this.reviews.createAndRecompute({
        orderId,
        restaurantId: order.restaurantId,
        customerId: user.id,
        rating: dto.rating,
        comment: dto.comment,
      });

      return ReviewResponseDto.from(review);
    } catch (error) {
      // The unique index is the arbiter, not a pre-flight SELECT that two
      // concurrent submissions could both pass.
      if (isUniqueViolation(error, 'reviews_order_id_unique')) {
        throw new ConflictException('This order has already been reviewed');
      }
      throw error;
    }
  }

  /** Public to any signed-in user — reviews are what browse ranks on. */
  async listForRestaurant(
    restaurantId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedDto<ReviewResponseDto>> {
    await this.restaurants.requireById(restaurantId);

    const { rows, total } = await this.reviews.findByRestaurant(restaurantId, {
      limit: query.limit,
      offset: query.offset,
    });

    return paginate(
      rows.map((row) => ReviewResponseDto.from(row)),
      total,
      query.limit,
      query.offset,
    );
  }
}
