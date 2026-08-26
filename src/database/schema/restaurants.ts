import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { menuCategories } from './menu-categories';
import { menuItems } from './menu-items';
import { users } from './users';

export const restaurants = pgTable(
  'restaurants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict`, not `cascade`: deleting an owner must not silently take a
    // restaurant (and its order history) with it.
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    addressLine: text('address_line').notNull(),
    city: text('city').notNull(),
    phone: text('phone'),
    // Money is always an integer count of the smallest currency unit. Floats
    // lose cents at exactly the wrong moment.
    deliveryFeeCents: integer('delivery_fee_cents').notNull().default(0),
    isOpen: boolean('is_open').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('restaurants_owner_id_idx').on(table.ownerId),
    index('restaurants_city_idx').on(table.city),
  ],
);

export const restaurantsRelations = relations(restaurants, ({ many }) => ({
  menuItems: many(menuItems),
  menuCategories: many(menuCategories),
}));

export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
