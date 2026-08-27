import { Injectable, NotFoundException } from '@nestjs/common';
import type { MenuItem } from '../../database/schema/menu-items';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { MenuItemResponseDto } from './dto/menu-item-response.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuCategoriesService } from './menu-categories.service';
import { MenuItemsRepository } from './menu-items.repository';
import { RestaurantsService } from './restaurants.service';
import { MESSAGES } from '../../common/messages';

@Injectable()
export class MenuItemsService {
  constructor(
    private readonly menuItems: MenuItemsRepository,
    private readonly restaurants: RestaurantsService,
    private readonly categories: MenuCategoriesService,
  ) {}

  async create(
    user: AuthenticatedUser,
    restaurantId: string,
    dto: CreateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    await this.restaurants.requireOwned(restaurantId, user);
    await this.assertCategoryBelongs(dto.categoryId, restaurantId);

    const item = await this.menuItems.insert({ ...dto, restaurantId });
    return MenuItemResponseDto.from(item);
  }

  /**
   * The menu. Customers see only what is orderable; the owner sees sold-out
   * items too, because they are the ones who have to switch them back on.
   */
  async list(
    user: AuthenticatedUser,
    restaurantId: string,
    options: { categoryId?: string } = {},
  ): Promise<MenuItemResponseDto[]> {
    const items = await this.listRows(restaurantId, {
      availableOnly: !(await this.manages(user, restaurantId)),
      categoryId: options.categoryId,
    });

    return items.map((item) => MenuItemResponseDto.from(item));
  }

  async update(
    user: AuthenticatedUser,
    restaurantId: string,
    itemId: string,
    dto: UpdateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    await this.restaurants.requireOwned(restaurantId, user);
    await this.requireInRestaurant(itemId, restaurantId);
    await this.assertCategoryBelongs(dto.categoryId, restaurantId);

    const item = await this.menuItems.update(itemId, dto);
    if (!item) throw new NotFoundException(MESSAGES.menu.itemNotFound);

    return MenuItemResponseDto.from(item);
  }

  async remove(user: AuthenticatedUser, restaurantId: string, itemId: string): Promise<void> {
    await this.restaurants.requireOwned(restaurantId, user);
    await this.requireInRestaurant(itemId, restaurantId);

    await this.menuItems.delete(itemId);
  }

  /** Batch lookup used by order creation to price a basket server-side. */
  /**
   * Single-item lookup across every restaurant.
   *
   * The cart needs this to work out which restaurant a dish belongs to before
   * it has a basket to scope the search by.
   */
  findAnyById(id: string): Promise<MenuItem | null> {
    return this.menuItems.findById(id);
  }

  findOrderableItems(restaurantId: string, ids: string[]): Promise<MenuItem[]> {
    return this.menuItems.findManyInRestaurant(restaurantId, ids);
  }

  /** Rows rather than DTOs, for assembling the composed menu view. */
  listRows(
    restaurantId: string,
    options: { availableOnly?: boolean; categoryId?: string } = {},
  ): Promise<MenuItem[]> {
    return this.menuItems.findByRestaurant(restaurantId, options);
  }

  async manages(user: AuthenticatedUser, restaurantId: string): Promise<boolean> {
    const restaurant = await this.restaurants.requireById(restaurantId);
    return user.role === 'admin' || restaurant.ownerId === user.id;
  }

  /**
   * A category id from another restaurant would file this item under someone
   * else's menu section. `undefined` means "not changing it"; `null` means
   * "clear it" — neither needs a lookup.
   */
  private async assertCategoryBelongs(
    categoryId: string | null | undefined,
    restaurantId: string,
  ): Promise<void> {
    if (!categoryId) return;

    await this.categories.requireInRestaurant(categoryId, restaurantId);
  }

  /**
   * Guards against a nested route being used to reach across restaurants:
   * `PATCH /restaurants/{mine}/menu-items/{someone-elses-item}` must 404, not
   * quietly edit the other restaurant's menu.
   */
  private async requireInRestaurant(itemId: string, restaurantId: string): Promise<MenuItem> {
    const item = await this.menuItems.findById(itemId);

    if (!item || item.restaurantId !== restaurantId) {
      throw new NotFoundException(MESSAGES.menu.itemNotFound);
    }

    return item;
  }
}
