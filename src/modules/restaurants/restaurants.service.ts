import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Restaurant } from '../../database/schema/restaurants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { ListRestaurantsQueryDto } from './dto/list-restaurants.query.dto';
import { RestaurantResponseDto } from './dto/restaurant-response.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { RestaurantsRepository } from './restaurants.repository';

@Injectable()
export class RestaurantsService {
  constructor(private readonly restaurants: RestaurantsRepository) {}

  async create(owner: AuthenticatedUser, dto: CreateRestaurantDto): Promise<RestaurantResponseDto> {
    const restaurant = await this.restaurants.insert({
      ...dto,
      // The owner is the caller. `@Roles('restaurant_owner', 'admin')` decides
      // *who may create*; this decides *whose it is*, and the client has no
      // say in either.
      ownerId: owner.id,
    });

    return RestaurantResponseDto.from(restaurant);
  }

  async list(query: ListRestaurantsQueryDto): Promise<RestaurantResponseDto[]> {
    const rows = await this.restaurants.findMany({
      city: query.city,
      openOnly: query.openOnly,
      limit: query.limit,
      offset: query.offset,
    });

    return rows.map((row) => RestaurantResponseDto.from(row));
  }

  async listOwnedBy(
    owner: AuthenticatedUser,
    query: ListRestaurantsQueryDto,
  ): Promise<RestaurantResponseDto[]> {
    const rows = await this.restaurants.findMany({
      ownerId: owner.id,
      limit: query.limit,
      offset: query.offset,
    });

    return rows.map((row) => RestaurantResponseDto.from(row));
  }

  async getById(id: string): Promise<RestaurantResponseDto> {
    return RestaurantResponseDto.from(await this.requireById(id));
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateRestaurantDto,
  ): Promise<RestaurantResponseDto> {
    await this.requireOwned(id, user);

    const restaurant = await this.restaurants.update(id, dto);
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    return RestaurantResponseDto.from(restaurant);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.requireOwned(id, user);

    const deleted = await this.restaurants.delete(id);
    if (!deleted) throw new NotFoundException('Restaurant not found');
  }

  /** Every restaurant id this user manages, for scoping their order list. */
  listOwnedIds(ownerId: string): Promise<string[]> {
    return this.restaurants.findIdsByOwner(ownerId);
  }

  /** Row lookup for other services (orders). Throws rather than returning null. */
  async requireById(id: string): Promise<Restaurant> {
    const restaurant = await this.restaurants.findById(id);
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    return restaurant;
  }

  /**
   * Authentication proved *who* is calling; this proves the restaurant is
   * theirs. Never infer ownership from the fact that a client sent the id.
   */
  async requireOwned(id: string, user: AuthenticatedUser): Promise<Restaurant> {
    const restaurant = await this.requireById(id);

    if (!isOwnedBy(restaurant, user)) {
      throw new ForbiddenException('You do not manage this restaurant');
    }

    return restaurant;
  }
}

export function isOwnedBy(restaurant: Restaurant, user: AuthenticatedUser): boolean {
  return user.role === 'admin' || restaurant.ownerId === user.id;
}
