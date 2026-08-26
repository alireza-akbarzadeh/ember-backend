import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import {
  menuCategories,
  type MenuCategory,
  type NewMenuCategory,
} from '../../database/schema/menu-categories';

/** Constraint name from migration 0002 — see `isUniqueViolation`. */
export const MENU_CATEGORY_NAME_UNIQUE = 'menu_categories_restaurant_name_unique';

@Injectable()
export class MenuCategoriesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: string): Promise<MenuCategory | null> {
    const [category] = await this.db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.id, id))
      .limit(1);

    return category ?? null;
  }

  findByRestaurant(restaurantId: string): Promise<MenuCategory[]> {
    return this.db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.restaurantId, restaurantId))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));
  }

  async insert(values: NewMenuCategory): Promise<MenuCategory> {
    const [category] = await this.db.insert(menuCategories).values(values).returning();

    return category;
  }

  async update(
    id: string,
    patch: Partial<Omit<NewMenuCategory, 'id' | 'restaurantId' | 'createdAt'>>,
  ): Promise<MenuCategory | null> {
    const [category] = await this.db
      .update(menuCategories)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(menuCategories.id, id))
      .returning();

    return category ?? null;
  }

  /**
   * Deleting a category does not delete its food: `menu_items.category_id` is
   * `ON DELETE SET NULL`, so the items fall back to uncategorised.
   */
  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(menuCategories)
      .where(eq(menuCategories.id, id))
      .returning({ id: menuCategories.id });

    return rows.length > 0;
  }
}
