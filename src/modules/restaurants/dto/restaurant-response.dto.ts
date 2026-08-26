import { ApiProperty } from '@nestjs/swagger';
import type { Restaurant } from '../../../database/schema/restaurants';
import type { RestaurantWithDistance } from '../restaurants.repository';

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

  @ApiProperty({ nullable: true, type: String })
  imageUrl: string | null;

  @ApiProperty({ example: ['italian', 'pizza'], isArray: true, type: String })
  cuisines: string[];

  @ApiProperty({ description: '1 to 4', example: 2 })
  priceLevel: number;

  @ApiProperty({ description: 'Delivery fee in cents', example: 299 })
  deliveryFeeCents: number;

  @ApiProperty({ description: 'Minimum order in cents', example: 1000 })
  minimumOrderCents: number;

  @ApiProperty({ example: 4.6 })
  ratingAverage: number;

  @ApiProperty({ example: 412 })
  ratingCount: number;

  @ApiProperty({ description: 'Typical prep time in minutes', example: 25 })
  preparationMinutes: number;

  @ApiProperty()
  isOpen: boolean;

  @ApiProperty({ nullable: true, type: Number })
  latitude: number | null;

  @ApiProperty({ nullable: true, type: Number })
  longitude: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Kilometres from the caller, to one decimal. Null when no location is known.',
    example: 1.4,
  })
  distanceKm: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static from(restaurant: Restaurant | RestaurantWithDistance): RestaurantResponseDto {
    const distance =
      'distanceKm' in restaurant && restaurant.distanceKm !== null
        ? // One decimal is all a "1.4 km away" label can use, and it keeps the
          // exact coordinates of the caller from being inferable by comparing
          // distances to several known restaurants.
          Math.round(restaurant.distanceKm * 10) / 10
        : null;

    return {
      id: restaurant.id,
      ownerId: restaurant.ownerId,
      name: restaurant.name,
      description: restaurant.description,
      addressLine: restaurant.addressLine,
      city: restaurant.city,
      phone: restaurant.phone,
      imageUrl: restaurant.imageUrl,
      cuisines: restaurant.cuisines,
      priceLevel: restaurant.priceLevel,
      deliveryFeeCents: restaurant.deliveryFeeCents,
      minimumOrderCents: restaurant.minimumOrderCents,
      ratingAverage: restaurant.ratingAverage,
      ratingCount: restaurant.ratingCount,
      preparationMinutes: restaurant.preparationMinutes,
      isOpen: restaurant.isOpen,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      distanceKm: distance,
      createdAt: restaurant.createdAt,
    };
  }
}
