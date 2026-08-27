import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import { restaurants } from '../../database/schema/restaurants';
import { reviews, type NewReview, type Review } from '../../database/schema/reviews';

@Injectable()
export class ReviewsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Writes the review and refreshes the restaurant's rating in one transaction.
   *
   * `restaurants.ratingAverage` and `ratingCount` are what browse ranks on, so
   * a review that landed without updating them would leave the front page
   * quietly wrong. Atomic here means the two can never disagree.
   *
   * The aggregate is recomputed from the reviews themselves rather than nudged
   * incrementally: exact regardless of how many land at once, and it stays
   * correct if a review is ever deleted.
   */
  async createAndRecompute(values: NewReview): Promise<Review> {
    return this.db.transaction(async (tx) => {
      const [review] = await tx.insert(reviews).values(values).returning();

      await tx
        .update(restaurants)
        .set({
          ratingAverage: sql`(
            select coalesce(avg(${reviews.rating}), 0)::double precision
            from ${reviews} where ${reviews.restaurantId} = ${values.restaurantId}
          )`,
          ratingCount: sql`(
            select count(*)::int
            from ${reviews} where ${reviews.restaurantId} = ${values.restaurantId}
          )`,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, values.restaurantId));

      return review;
    });
  }

  async findByOrder(orderId: string): Promise<Review | null> {
    const [review] = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.orderId, orderId))
      .limit(1);

    return review ?? null;
  }

  async findByRestaurant(
    restaurantId: string,
    options: { limit: number; offset: number },
  ): Promise<{ rows: Review[]; total: number }> {
    const where = eq(reviews.restaurantId, restaurantId);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(reviews)
        .where(where)
        .orderBy(desc(reviews.createdAt))
        .limit(options.limit)
        .offset(options.offset),
      this.db.select({ value: count() }).from(reviews).where(where),
    ]);

    return { rows, total: totals?.value ?? 0 };
  }
}
