import { relations } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { menuItems } from './menu-items';
import { restaurants } from './restaurants';

/**
 * A section of one restaurant's menu — "Burgers", "Drinks", "Desserts".
 *
 * Scoped to a restaurant rather than global: two restaurants both having a
 * "Sides" section are unrelated facts, and a shared taxonomy would force every
 * owner to agree on one vocabulary.
 */
export const menuCategories = pgTable(
  'menu_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // Owners decide the running order of their menu; ties fall back to name.
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('menu_categories_restaurant_id_idx').on(table.restaurantId),
    unique('menu_categories_restaurant_name_unique').on(table.restaurantId, table.name),
  ],
);

export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [menuCategories.restaurantId],
    references: [restaurants.id],
  }),
  items: many(menuItems),
}));

export type MenuCategory = typeof menuCategories.$inferSelect;
export type NewMenuCategory = typeof menuCategories.$inferInsert;
