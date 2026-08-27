import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MenuItem } from '../../database/schema/menu-items';
import type { Restaurant } from '../../database/schema/restaurants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MenuCategoriesService } from './menu-categories.service';
import { MenuItemsRepository } from './menu-items.repository';
import { MenuItemsService } from './menu-items.service';
import { RestaurantsService } from './restaurants.service';

const OWNER: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.com',
  role: 'restaurant_owner',
};
const CUSTOMER: AuthenticatedUser = {
  id: 'customer-1',
  email: 'sam@example.com',
  role: 'customer',
};

function aRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: 'restaurant-1',
    ownerId: OWNER.id,
    name: 'Ember Grill',
    description: null,
    addressLine: '221B Baker Street',
    city: 'London',
    phone: null,
    imageUrl: null,
    deliveryFeeCents: 299,
    minimumOrderCents: 1200,
    isOpen: true,
    latitude: 51.5262,
    longitude: -0.0813,
    cuisines: ['italian', 'pizza'],
    priceLevel: 2,
    ratingAverage: 4.7,
    ratingCount: 1240,
    preparationMinutes: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function aMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    restaurantId: 'restaurant-1',
    categoryId: null,
    name: 'Smash Burger',
    description: null,
    priceCents: 1250,
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('MenuItemsService', () => {
  let service: MenuItemsService;

  const repository = {
    findById: jest.fn(),
    findByRestaurant: jest.fn(),
    findManyInRestaurant: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const restaurants = {
    requireById: jest.fn(),
    requireOwned: jest.fn(),
  };

  const categories = {
    requireInRestaurant: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        MenuItemsService,
        { provide: MenuItemsRepository, useValue: repository },
        { provide: RestaurantsService, useValue: restaurants },
        { provide: MenuCategoriesService, useValue: categories },
      ],
    }).compile();

    service = module.get(MenuItemsService);
  });

  describe('create', () => {
    it('refuses someone else’s restaurant', async () => {
      restaurants.requireOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.create(CUSTOMER, 'restaurant-1', {
          name: 'Smash Burger',
          priceCents: 1250,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('refuses a category belonging to another restaurant', async () => {
      restaurants.requireOwned.mockResolvedValue(aRestaurant());
      categories.requireInRestaurant.mockRejectedValue(new NotFoundException('Category not found'));

      await expect(
        service.create(OWNER, 'restaurant-1', {
          name: 'Smash Burger',
          priceCents: 1250,
          categoryId: 'category-from-elsewhere',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('skips the category check when none is given', async () => {
      restaurants.requireOwned.mockResolvedValue(aRestaurant());
      repository.insert.mockResolvedValue(aMenuItem());

      await service.create(OWNER, 'restaurant-1', {
        name: 'Smash Burger',
        priceCents: 1250,
      });

      expect(categories.requireInRestaurant).not.toHaveBeenCalled();
    });

    it('treats a null category as "clear it", not as a lookup', async () => {
      restaurants.requireOwned.mockResolvedValue(aRestaurant());
      repository.insert.mockResolvedValue(aMenuItem());

      await service.create(OWNER, 'restaurant-1', {
        name: 'Smash Burger',
        priceCents: 1250,
        categoryId: null,
      });

      expect(categories.requireInRestaurant).not.toHaveBeenCalled();
      expect(repository.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('404s for an item that belongs to a different restaurant', async () => {
      restaurants.requireOwned.mockResolvedValue(aRestaurant());
      repository.findById.mockResolvedValue(aMenuItem({ restaurantId: 'restaurant-2' }));

      await expect(
        service.update(OWNER, 'restaurant-1', 'item-1', { priceCents: 1 }),
      ).rejects.toThrow(NotFoundException);

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('hides sold-out items from a customer', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant());
      repository.findByRestaurant.mockResolvedValue([]);

      await service.list(CUSTOMER, 'restaurant-1');

      expect(repository.findByRestaurant).toHaveBeenCalledWith(
        'restaurant-1',
        expect.objectContaining({ availableOnly: true }),
      );
    });

    it('shows sold-out items to the owner, who has to switch them back on', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant());
      repository.findByRestaurant.mockResolvedValue([]);

      await service.list(OWNER, 'restaurant-1');

      expect(repository.findByRestaurant).toHaveBeenCalledWith(
        'restaurant-1',
        expect.objectContaining({ availableOnly: false }),
      );
    });

    it('passes a category filter through', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant());
      repository.findByRestaurant.mockResolvedValue([]);

      await service.list(CUSTOMER, 'restaurant-1', {
        categoryId: 'category-1',
      });

      expect(repository.findByRestaurant).toHaveBeenCalledWith(
        'restaurant-1',
        expect.objectContaining({ categoryId: 'category-1' }),
      );
    });
  });
});
