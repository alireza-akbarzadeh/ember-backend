import { relations } from 'drizzle-orm';
import { index, integer, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { carts } from './carts';
import { menuItems } from './menu-items';

/**
 * A line in the basket: which dish, how many. Nothing else.
 *
 * `unique(cart_id, menu_item_id)` means adding the same dish twice increments
 * rather than creating a second line, which is what "add to cart" means to
 * anyone using it — and it makes the increment an upsert instead of a
 * read-then-write that two taps could race.
 */
export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    // `cascade`: if a restaurant deletes a dish, it silently leaves the
    // baskets that held it. The cart read reports the shortfall so the
    // customer finds out before checkout rather than during it.
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
  },
  (table) => [
    index('cart_items_cart_id_idx').on(table.cartId),
    unique('cart_items_cart_menu_item_unique').on(table.cartId, table.menuItemId),
  ],
);

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
  menuItem: one(menuItems, {
    fields: [cartItems.menuItemId],
    references: [menuItems.id],
  }),
}));

export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;
