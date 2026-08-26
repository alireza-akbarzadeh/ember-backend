import { Module } from '@nestjs/common';
import { MenuCategoriesController } from './menu-categories.controller';
import { MenuCategoriesRepository } from './menu-categories.repository';
import { MenuCategoriesService } from './menu-categories.service';
import { MenuController } from './menu.controller';
import { MenuItemsController } from './menu-items.controller';
import { MenuItemsRepository } from './menu-items.repository';
import { MenuItemsService } from './menu-items.service';
import { MenuService } from './menu.service';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsRepository } from './restaurants.repository';
import { RestaurantsService } from './restaurants.service';

/**
 * Restaurants and everything that hangs off one: menu sections, the food in
 * them, and the composed restaurant-page view.
 *
 * Route order matters across these controllers — `restaurants/:id` is
 * registered after the more specific `restaurants/:restaurantId/...` prefixes
 * by Nest's own controller ordering, and `restaurants/mine` is declared before
 * `restaurants/:id` inside RestaurantsController.
 */
@Module({
  controllers: [
    RestaurantsController,
    MenuCategoriesController,
    MenuItemsController,
    MenuController,
  ],
  providers: [
    RestaurantsService,
    RestaurantsRepository,
    MenuCategoriesService,
    MenuCategoriesRepository,
    MenuItemsService,
    MenuItemsRepository,
    MenuService,
  ],
  // Orders needs to price a basket and check restaurant ownership. It gets
  // there through these services — never through the repositories.
  exports: [RestaurantsService, MenuItemsService, MenuCategoriesService],
})
export class RestaurantsModule {}
