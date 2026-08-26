import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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
    minimumOrderCents: integer('minimum_order_cents').notNull().default(0),
    isOpen: boolean('is_open').notNull().default(true),

    // Nullable: a restaurant can exist before it has been geocoded. Nearby
    // search skips those rather than pretending they are at (0, 0) — an island
    // in the Atlantic that would otherwise rank first for half the planet.
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),

    /**
     * Cuisine tags, e.g. {italian,pizza}. An array with a GIN index rather than
     * a join table: the vocabulary is small and closed, and every query is
     * "does this restaurant have any of these tags", which `&&` answers
     * directly.
     */
    cuisines: text('cuisines').array().notNull().default([]),

    /** 1–4, the usual £ to ££££. */
    priceLevel: integer('price_level').notNull().default(2),

    /**
     * Denormalised from reviews, which do not exist yet — seeded for now.
     * Whatever writes reviews owns keeping these true.
     *
     * doublePrecision is fine here for the same reason it is wrong for money:
     * this is a derived average nobody sums, and it must be sortable.
     */
    ratingAverage: doublePrecision('rating_average').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),

    /** Typical minutes from order accepted to ready. Drives the ETA shown. */
    preparationMinutes: integer('preparation_minutes').notNull().default(25),

    imageUrl: text('image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('restaurants_owner_id_idx').on(table.ownerId),
    index('restaurants_city_idx').on(table.city),
    // Nearby search prefilters with a lat/lng bounding box before computing
    // exact distances, so this composite is what keeps it off a seq scan.
    index('restaurants_location_idx').on(table.latitude, table.longitude),
    index('restaurants_rating_idx').on(table.ratingAverage),
    index('restaurants_cuisines_idx').using('gin', table.cuisines),
  ],
);

export const restaurantsRelations = relations(restaurants, ({ many }) => ({
  menuItems: many(menuItems),
  menuCategories: many(menuCategories),
}));

export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
