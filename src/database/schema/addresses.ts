import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * A delivery address the customer saved.
 *
 * Coordinates are required: an address that cannot be placed on a map is
 * useless for the one thing this table exists to do — rank restaurants by how
 * far away they are. Geocoding happens before the row is written.
 */
export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city').notNull(),
    postalCode: text('postal_code'),
    // doublePrecision is right for coordinates and wrong for money: ~1cm of
    // precision at these magnitudes, and nobody sums latitudes.
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('addresses_user_id_idx').on(table.userId),
    // "Exactly one default" enforced by the database rather than by remembering
    // to clear the old one — a partial unique index over just the default rows.
    uniqueIndex('addresses_one_default_per_user')
      .on(table.userId)
      .where(sql`${table.isDefault}`),
  ],
);

export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(users, {
    fields: [addresses.userId],
    references: [users.id],
  }),
}));

export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
