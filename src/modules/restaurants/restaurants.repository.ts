import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import {
  type NewRestaurant,
  type Restaurant,
  restaurants,
} from '../../database/schema/restaurants';

export interface FindRestaurantsOptions {
  city?: string;
  ownerId?: string;
  openOnly?: boolean;
  limit: number;
  offset: number;
}

@Injectable()
export class RestaurantsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: string): Promise<Restaurant | null> {
    const [restaurant] = await this.db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, id))
      .limit(1);

    return restaurant ?? null;
  }

  findMany(options: FindRestaurantsOptions): Promise<Restaurant[]> {
    const filters: SQL[] = [];

    if (options.city) filters.push(eq(restaurants.city, options.city));
    if (options.ownerId) filters.push(eq(restaurants.ownerId, options.ownerId));
    if (options.openOnly) filters.push(eq(restaurants.isOpen, true));

    return this.db
      .select()
      .from(restaurants)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(restaurants.createdAt))
      .limit(options.limit)
      .offset(options.offset);
  }

  /** Ids only — used to scope an owner's order list without loading rows. */
  async findIdsByOwner(ownerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.ownerId, ownerId));

    return rows.map((row) => row.id);
  }

  async insert(values: NewRestaurant): Promise<Restaurant> {
    const [restaurant] = await this.db.insert(restaurants).values(values).returning();

    return restaurant;
  }

  async update(
    id: string,
    patch: Partial<Omit<NewRestaurant, 'id' | 'ownerId' | 'createdAt'>>,
  ): Promise<Restaurant | null> {
    const [restaurant] = await this.db
      .update(restaurants)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(restaurants.id, id))
      .returning();

    return restaurant ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(restaurants)
      .where(eq(restaurants.id, id))
      .returning({ id: restaurants.id });

    return rows.length > 0;
  }
}
