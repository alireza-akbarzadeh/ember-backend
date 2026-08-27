import { relations, sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { restaurants } from './restaurants';
import { users } from './users';

/**
 * One review per delivered order.
 *
 * Tying a review to an order rather than to a restaurant is what makes it
 * trustworthy: you cannot review somewhere you never ordered from, and the
 * unique index on `order_id` means you cannot review the same meal twice. That
 * is spam resistance the database enforces, not something a service has to
 * remember to check.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Denormalised from the order so listing a restaurant's reviews and
    // recomputing its average never need a join.
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reviews_restaurant_id_idx').on(table.restaurantId),
    index('reviews_customer_id_idx').on(table.customerId),
    // The DTO validates this too. Both matter: the DTO gives a good error
    // message, the constraint means a 6-star review cannot exist however the
    // row got written.
    check('reviews_rating_range', sql`${table.rating} between 1 and 5`),
  ],
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [reviews.restaurantId],
    references: [restaurants.id],
  }),
  order: one(orders, {
    fields: [reviews.orderId],
    references: [orders.id],
  }),
}));

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
