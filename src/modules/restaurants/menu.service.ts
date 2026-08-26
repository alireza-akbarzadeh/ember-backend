import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MenuCategoryResponseDto } from './dto/menu-category-response.dto';
import { MenuItemResponseDto } from './dto/menu-item-response.dto';
import { RestaurantResponseDto } from './dto/restaurant-response.dto';
import {
  MenuCategoryWithItemsDto,
  RestaurantMenuResponseDto,
} from './dto/restaurant-menu-response.dto';
import { MenuCategoriesService } from './menu-categories.service';
import { MenuItemsService } from './menu-items.service';
import { RestaurantsService } from './restaurants.service';

/**
 * Read-only composition of the restaurant page: the restaurant, its sections,
 * and the food in each. Writes go through the category and item services.
 */
@Injectable()
export class MenuService {
  constructor(
    private readonly restaurants: RestaurantsService,
    private readonly categories: MenuCategoriesService,
    private readonly menuItems: MenuItemsService,
  ) {}

  async getMenu(user: AuthenticatedUser, restaurantId: string): Promise<RestaurantMenuResponseDto> {
    const restaurant = await this.restaurants.requireById(restaurantId);
    const manages = user.role === 'admin' || restaurant.ownerId === user.id;

    // Two independent reads — sections and food — then grouped in memory.
    // Querying items per category would be an N+1 that scales with menu size.
    const [categories, items] = await Promise.all([
      this.categories.listRows(restaurantId),
      this.menuItems.listRows(restaurantId, { availableOnly: !manages }),
    ]);

    const grouped = new Map<string, MenuItemResponseDto[]>();
    const uncategorizedItems: MenuItemResponseDto[] = [];

    for (const item of items) {
      const dto = MenuItemResponseDto.from(item);

      if (!item.categoryId) {
        uncategorizedItems.push(dto);
        continue;
      }

      const bucket = grouped.get(item.categoryId);
      if (bucket) bucket.push(dto);
      else grouped.set(item.categoryId, [dto]);
    }

    const withItems: MenuCategoryWithItemsDto[] = categories.map((category) => ({
      ...MenuCategoryResponseDto.from(category),
      // An empty section is still a section — owners need to see the ones
      // they have not filled in yet.
      items: grouped.get(category.id) ?? [],
    }));

    return {
      restaurant: RestaurantResponseDto.from(restaurant),
      categories: withItems,
      uncategorizedItems,
    };
  }
}
