import { ApiProperty } from '@nestjs/swagger';
import type { Restaurant } from '../../../database/schema/restaurants';

export class RestaurantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  @ApiProperty({ example: 'Ember Grill' })
  name: string;

  @ApiProperty({ nullable: true, type: String })
  description: string | null;

  @ApiProperty({ example: '221B Baker Street' })
  addressLine: string;

  @ApiProperty({ example: 'London' })
  city: string;

  @ApiProperty({ nullable: true, type: String })
  phone: string | null;

  @ApiProperty({ description: 'Delivery fee in cents', example: 299 })
  deliveryFeeCents: number;

  @ApiProperty()
  isOpen: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static from(restaurant: Restaurant): RestaurantResponseDto {
    return {
      id: restaurant.id,
      ownerId: restaurant.ownerId,
      name: restaurant.name,
      description: restaurant.description,
      addressLine: restaurant.addressLine,
      city: restaurant.city,
      phone: restaurant.phone,
      deliveryFeeCents: restaurant.deliveryFeeCents,
      isOpen: restaurant.isOpen,
      createdAt: restaurant.createdAt,
    };
  }
}
