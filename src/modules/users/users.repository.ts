import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import {
  type NewUser,
  type User,
  type UserRole,
  type UserStatus,
  users,
} from '../../database/schema/users';

export interface SearchUsersOptions {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  limit: number;
  offset: number;
}

export interface SearchUsersResult {
  rows: User[];
  total: number;
}

/**
 * Drizzle queries for `users` and nothing else.
 *
 * Returns rows or `null` — it never throws HTTP exceptions and holds no rules.
 * Not exported from `UsersModule`: everything outside goes through
 * `UsersService` so the invariants stay in one place.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);

    return user ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

    return user ?? null;
  }

  /**
   * The admin browse query: filter, paginate, newest first.
   *
   * Runs the page and the count together — the client needs `total` to render
   * pagination, and neither query depends on the other's result.
   */
  async search(options: SearchUsersOptions): Promise<SearchUsersResult> {
    const where = this.buildFilters(options);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(options.limit)
        .offset(options.offset),
      this.db.select({ value: count() }).from(users).where(where),
    ]);

    return { rows, total: totals?.value ?? 0 };
  }

  private buildFilters(options: SearchUsersOptions): SQL | undefined {
    const filters: SQL[] = [];

    if (options.role) filters.push(eq(users.role, options.role));
    if (options.status) filters.push(eq(users.status, options.status));

    if (options.search) {
      const pattern = likePattern(options.search);

      // ILIKE with a leading wildcard cannot use a btree index, so this scans.
      // Fine at admin-panel scale; swap in pg_trgm + GIN before it isn't.
      const matches = or(ilike(users.fullName, pattern), ilike(users.email, pattern));
      if (matches) filters.push(matches);
    }

    return filters.length > 0 ? and(...filters) : undefined;
  }

  async insert(values: NewUser): Promise<User> {
    const [user] = await this.db.insert(users).values(values).returning();
    return user;
  }

  async update(
    id: string,
    patch: Partial<Omit<NewUser, 'id' | 'createdAt'>>,
  ): Promise<User | null> {
    const [user] = await this.db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return user ?? null;
  }
}

/**
 * Escapes a user's search text for a LIKE pattern.
 *
 * Without this, someone typing `%` matches every user and `_` matches any
 * character — not a security hole, but search that quietly stops working.
 */
function likePattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}
