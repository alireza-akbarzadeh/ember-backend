import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import { type NewUser, type User, users } from '../../database/schema/users';

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
