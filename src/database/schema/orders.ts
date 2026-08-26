import { relations } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orderItems } from './order-items';
import { restaurants } from './restaurants';
import { users } from './users';

/**
 * Lifecycle of an order. Which transitions are legal, and who may perform
 * them, lives in `src/modules/orders/order-status.ts` — the database only
 * stores the current value.
 */
export const orderStatus = pgEnum('order_status', [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'restrict' }),
    // Null until a courier claims the order.
    courierId: uuid('courier_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: orderStatus('status').notNull().default('pending'),

    // All three are computed server-side from menu prices at order time and
    // stored, so a later price change never rewrites what someone was charged.
    subtotalCents: integer('subtotal_cents').notNull(),
    deliveryFeeCents: integer('delivery_fee_cents').notNull(),
    totalCents: integer('total_cents').notNull(),

    deliveryAddress: text('delivery_address').notNull(),
    deliveryNotes: text('delivery_notes'),

    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('orders_customer_id_idx').on(table.customerId),
    index('orders_restaurant_id_idx').on(table.restaurantId),
    index('orders_courier_id_idx').on(table.courierId),
    // Couriers browse unclaimed work by status; restaurants filter their own
    // queue the same way.
    index('orders_status_idx').on(table.status),
  ],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [orders.restaurantId],
    references: [restaurants.id],
  }),
  items: many(orderItems),
}));

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderStatus = (typeof orderStatus.enumValues)[number];
