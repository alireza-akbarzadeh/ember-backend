import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate, type PaginatedDto } from '../../common/dto/paginated.dto';
import type { Restaurant } from '../../database/schema/restaurants';
import { AddressesService } from '../addresses/addresses.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { ListRestaurantsQueryDto } from './dto/list-restaurants.query.dto';
import { RestaurantResponseDto } from './dto/restaurant-response.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import type { Coordinates } from './geo';
import { RestaurantsRepository } from './restaurants.repository';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly restaurants: RestaurantsRepository,
    private readonly addresses: AddressesService,
  ) {}

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

  /**
   * Browse and search.
   *
   * The ranking answers "where should I eat" differently depending on what is
   * known about the caller: with a location, nearest first; without one,
   * best-rated first — smoothed, so a single five-star review cannot take the
   * top slot from a restaurant with four hundred.
   */
  async browse(
    query: ListRestaurantsQueryDto,
    user?: AuthenticatedUser,
  ): Promise<PaginatedDto<RestaurantResponseDto>> {
    const origin = await this.resolveOrigin(query, user);

    const { rows, total } = await this.restaurants.search({
      search: query.search,
      city: query.city,
      cuisine: query.cuisine,
      priceLevel: query.priceLevel,
      minRating: query.minRating,
      maxDeliveryFeeCents: query.maxDeliveryFeeCents,
      openNow: query.openNow,
      origin,
      radiusKm: origin ? query.radiusKm : undefined,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
    });

    return paginate(
      rows.map((row) => RestaurantResponseDto.from(row)),
      total,
      query.limit,
      query.offset,
    );
  }

  async listOwnedBy(
    owner: AuthenticatedUser,
    query: ListRestaurantsQueryDto,
  ): Promise<PaginatedDto<RestaurantResponseDto>> {
    const { rows, total } = await this.restaurants.search({
      ownerId: owner.id,
      limit: query.limit,
      offset: query.offset,
    });

    return paginate(
      rows.map((row) => RestaurantResponseDto.from(row)),
      total,
      query.limit,
      query.offset,
    );
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

  /**
   * Where to measure distance from, in order of preference:
   *
   * 1. Coordinates in the query — the user dragged a pin or picked "deliver to".
   * 2. Their saved default address.
   * 3. Nothing, for a signed-out or address-less visitor, who gets the
   *    quality ranking instead of an empty list.
   */
  private async resolveOrigin(
    query: ListRestaurantsQueryDto,
    user?: AuthenticatedUser,
  ): Promise<Coordinates | undefined> {
    if (query.latitude !== undefined && query.longitude !== undefined) {
      return { latitude: query.latitude, longitude: query.longitude };
    }

    if (!user) return undefined;

    const address = await this.addresses.findDefault(user.id);
    if (!address) return undefined;

    return { latitude: address.latitude, longitude: address.longitude };
  }
}

export function isOwnedBy(restaurant: Restaurant, user: AuthenticatedUser): boolean {
  return user.role === 'admin' || restaurant.ownerId === user.id;
}
