import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUniqueViolation } from '../../database/database.errors';
import type { MenuCategory } from '../../database/schema/menu-categories';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { MenuCategoryResponseDto } from './dto/menu-category-response.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { MENU_CATEGORY_NAME_UNIQUE, MenuCategoriesRepository } from './menu-categories.repository';
import { RestaurantsService } from './restaurants.service';
import { MESSAGES } from '../../common/messages';

@Injectable()
export class MenuCategoriesService {
  constructor(
    private readonly categories: MenuCategoriesRepository,
    private readonly restaurants: RestaurantsService,
  ) {}

  async create(
    user: AuthenticatedUser,
    restaurantId: string,
    dto: CreateMenuCategoryDto,
  ): Promise<MenuCategoryResponseDto> {
    await this.restaurants.requireOwned(restaurantId, user);

    try {
      const category = await this.categories.insert({ ...dto, restaurantId });
      return MenuCategoryResponseDto.from(category);
    } catch (error) {
      // The (restaurant_id, name) unique index is the arbiter, not a
      // pre-flight SELECT that two concurrent creates could both pass.
      if (isUniqueViolation(error, MENU_CATEGORY_NAME_UNIQUE)) {
        throw new ConflictException(MESSAGES.menu.duplicateCategoryName);
      }
      throw error;
    }
  }

  /** Menu sections are readable by any signed-in user — this is the menu. */
  async list(restaurantId: string): Promise<MenuCategoryResponseDto[]> {
    await this.restaurants.requireById(restaurantId);

    const rows = await this.categories.findByRestaurant(restaurantId);
    return rows.map((row) => MenuCategoryResponseDto.from(row));
  }

  async update(
    user: AuthenticatedUser,
    restaurantId: string,
    categoryId: string,
    dto: UpdateMenuCategoryDto,
  ): Promise<MenuCategoryResponseDto> {
    await this.restaurants.requireOwned(restaurantId, user);
    await this.requireInRestaurant(categoryId, restaurantId);

    try {
      const category = await this.categories.update(categoryId, dto);
      if (!category) throw new NotFoundException(MESSAGES.menu.categoryNotFound);

      return MenuCategoryResponseDto.from(category);
    } catch (error) {
      if (isUniqueViolation(error, MENU_CATEGORY_NAME_UNIQUE)) {
        throw new ConflictException(MESSAGES.menu.duplicateCategoryName);
      }
      throw error;
    }
  }

  async remove(user: AuthenticatedUser, restaurantId: string, categoryId: string): Promise<void> {
    await this.restaurants.requireOwned(restaurantId, user);
    await this.requireInRestaurant(categoryId, restaurantId);

    await this.categories.delete(categoryId);
  }

  /**
   * Confirms a category belongs to the restaurant an item is being filed
   * under. Without it, an owner could point their item at another
   * restaurant's category id and corrupt that menu's grouping.
   */
  async requireInRestaurant(categoryId: string, restaurantId: string): Promise<MenuCategory> {
    const category = await this.categories.findById(categoryId);

    if (!category || category.restaurantId !== restaurantId) {
      throw new NotFoundException(MESSAGES.menu.categoryNotFound);
    }

    return category;
  }

  /** Rows rather than DTOs, for assembling the composed menu view. */
  listRows(restaurantId: string): Promise<MenuCategory[]> {
    return this.categories.findByRestaurant(restaurantId);
  }
}
