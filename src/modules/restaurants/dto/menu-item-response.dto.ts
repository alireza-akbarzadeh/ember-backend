import { ApiProperty } from '@nestjs/swagger';
import type { MenuItem } from '../../../database/schema/menu-items';

export class MenuItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  restaurantId: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  categoryId: string | null;

  @ApiProperty({ example: 'Smash Burger' })
  name: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ description: 'Price in cents', example: 1250 })
  priceCents: number;

  @ApiProperty()
  isAvailable: boolean;

  static from(item: MenuItem): MenuItemResponseDto {
    return {
      id: item.id,
      restaurantId: item.restaurantId,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      priceCents: item.priceCents,
      isAvailable: item.isAvailable,
    };
  }
}
