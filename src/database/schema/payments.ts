import { relations } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orders } from './orders';
import { users } from './users';

/**
 * Where a payment is in its life.
 *
 * `authorized` and `captured` are separate because they are separate events at
 * every real provider: the money is reserved, then taken. Food delivery
 * captures straight away, but collapsing them in the schema would make adding
 * "authorize now, capture on delivery" a migration instead of a config change.
 */
export const paymentStatus = pgEnum('payment_status', [
  'pending',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'cancelled',
]);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /**
     * The single most important column here.
     *
     * A client that times out and retries, or a customer who double-taps Pay,
     * must not be charged twice. The unique index makes the second attempt
     * collide instead of creating a second charge — enforced by the database,
     * because "remember to check first" is not a guarantee under concurrency.
     */
    idempotencyKey: text('idempotency_key').notNull().unique(),

    amountCents: integer('amount_cents').notNull(),
    // Stored per payment, not per restaurant: what was charged, in what
    // currency, must stay true even if the platform later adds more.
    currency: text('currency').notNull().default('GBP'),

    status: paymentStatus('status').notNull().default('pending'),

    /** Which adapter handled it — `fake` in development, `stripe` in production. */
    provider: text('provider').notNull(),
    /** The provider's own id, for reconciliation and support tickets. */
    providerRef: text('provider_ref'),
    /** Provider-supplied reason, safe to show; never a raw error. */
    failureReason: text('failure_reason'),

    capturedAt: timestamp('captured_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('payments_customer_id_idx').on(table.customerId),
    index('payments_status_idx').on(table.status),
    index('payments_provider_ref_idx').on(table.providerRef),
  ],
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
}));

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
