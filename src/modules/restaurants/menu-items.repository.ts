import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import { menuItems, type MenuItem, type NewMenuItem } from '../../database/schema/menu-items';

@Injectable()
export class MenuItemsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: string): Promise<MenuItem | null> {
    const [item] = await this.db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);

    return item ?? null;
  }

  findByRestaurant(
    restaurantId: string,
    options: { availableOnly?: boolean; categoryId?: string } = {},
  ): Promise<MenuItem[]> {
    const filters = [eq(menuItems.restaurantId, restaurantId)];

    if (options.availableOnly) filters.push(eq(menuItems.isAvailable, true));
    if (options.categoryId) {
      filters.push(eq(menuItems.categoryId, options.categoryId));
    }

    return this.db
      .select()
      .from(menuItems)
      .where(and(...filters))
      .orderBy(asc(menuItems.name));
  }

  /**
   * Batch lookup for order creation — one query for the whole basket instead
   * of one per line. Scoped to the restaurant so an item id from a *different*
   * restaurant simply doesn't come back, and the caller reports it as invalid.
   */
  findManyInRestaurant(restaurantId: string, ids: string[]): Promise<MenuItem[]> {
    if (ids.length === 0) return Promise.resolve([]);

    return this.db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.restaurantId, restaurantId), inArray(menuItems.id, ids)));
  }

  async insert(values: NewMenuItem): Promise<MenuItem> {
    const [item] = await this.db.insert(menuItems).values(values).returning();
    return item;
  }

  async update(
    id: string,
    patch: Partial<Omit<NewMenuItem, 'id' | 'restaurantId' | 'createdAt'>>,
  ): Promise<MenuItem | null> {
    const [item] = await this.db
      .update(menuItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(menuItems.id, id))
      .returning();

    return item ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(menuItems)
      .where(eq(menuItems.id, id))
      .returning({ id: menuItems.id });

    return rows.length > 0;
  }
}
