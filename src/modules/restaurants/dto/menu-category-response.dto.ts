import { ApiProperty } from '@nestjs/swagger';
import type { MenuCategory } from '../../../database/schema/menu-categories';

export class MenuCategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  restaurantId: string;

  @ApiProperty({ example: 'Burgers' })
  name: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  static from(category: MenuCategory): MenuCategoryResponseDto {
    return {
      id: category.id,
      restaurantId: category.restaurantId,
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
    };
  }
}
