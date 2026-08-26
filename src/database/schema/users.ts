import { relations } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { refreshTokens } from './refresh-tokens';

/**
 * Who the account belongs to. Drives authorization via the `@Roles()` guard —
 * a value is never accepted from a request body, it is set server-side.
 */
export const userRole = pgEnum('user_role', ['customer', 'courier', 'restaurant_owner', 'admin']);

/**
 * `suspended` and `deleted` accounts keep their row (orders reference it) but
 * are rejected at authentication time.
 */
export const userStatus = pgEnum('user_status', ['active', 'suspended', 'deleted']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Stored lower-cased and trimmed so the unique constraint is meaningful.
  email: text('email').notNull().unique(),
  phone: text('phone').unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('customer'),
  status: userStatus('status').notNull().default('active'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof userRole.enumValues)[number];
export type UserStatus = (typeof userStatus.enumValues)[number];
