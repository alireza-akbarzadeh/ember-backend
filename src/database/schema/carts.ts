import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cartItems } from './cart-items';
import { restaurants } from './restaurants';
import { users } from './users';

/**
 * One open basket per customer.
 *
 * The unique index on `user_id` is the rule, not a convention the service has
 * to remember: a customer cannot accumulate several half-finished baskets, and
 * "add something from a different restaurant" becomes an explicit decision
 * (clear and start over) rather than a silent second cart.
 *
 * Note what is absent: any money at all. Prices live on `menu_items` and are
 * read fresh every time the cart is displayed and again at checkout. A price
 * copied in here would be a stale price waiting to be charged.
 */
export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    // A cart belongs to exactly one restaurant — you cannot order a burger
    // from one kitchen and sushi from another in a single delivery.
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('carts_restaurant_id_idx').on(table.restaurantId)],
);

export const cartsRelations = relations(carts, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [carts.restaurantId],
    references: [restaurants.id],
  }),
  items: many(cartItems),
}));

export type Cart = typeof carts.$inferSelect;
export type NewCart = typeof carts.$inferInsert;
