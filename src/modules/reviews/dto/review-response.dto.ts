import { ApiProperty } from '@nestjs/swagger';
import type { Review } from '../../../database/schema/reviews';

export class ReviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  restaurantId: string;

  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty({ format: 'uuid' })
  customerId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  rating: number;

  @ApiProperty({ nullable: true, type: String })
  comment: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static from(review: Review): ReviewResponseDto {
    return {
      id: review.id,
      restaurantId: review.restaurantId,
      orderId: review.orderId,
      customerId: review.customerId,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
    };
  }
}
