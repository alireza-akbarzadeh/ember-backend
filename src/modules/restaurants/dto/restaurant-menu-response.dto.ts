import { ApiProperty } from '@nestjs/swagger';
import { MenuCategoryResponseDto } from './menu-category-response.dto';
import { MenuItemResponseDto } from './menu-item-response.dto';
import { RestaurantResponseDto } from './restaurant-response.dto';

export class MenuCategoryWithItemsDto extends MenuCategoryResponseDto {
  @ApiProperty({ type: [MenuItemResponseDto] })
  items: MenuItemResponseDto[];
}

/**
 * The restaurant page in one response: who they are, their sections, and what
 * is in each. Assembled from two queries rather than one per category — a menu
 * with fifteen sections must not cost sixteen round trips.
 */
export class RestaurantMenuResponseDto {
  @ApiProperty({ type: RestaurantResponseDto })
  restaurant: RestaurantResponseDto;

  @ApiProperty({ type: [MenuCategoryWithItemsDto] })
  categories: MenuCategoryWithItemsDto[];

  @ApiProperty({
    type: [MenuItemResponseDto],
    description: 'Items not filed under any category',
  })
  uncategorizedItems: MenuItemResponseDto[];
}
