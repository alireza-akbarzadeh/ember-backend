import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MESSAGES } from '../../common/messages';
import type { MenuItem } from '../../database/schema/menu-items';
import type { Restaurant } from '../../database/schema/restaurants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrdersService } from '../orders/orders.service';
import { MenuItemsService } from '../restaurants/menu-items.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';

const CUSTOMER: AuthenticatedUser = {
  id: 'customer-1',
  email: 'sam@example.com',
  role: 'customer',
};

function aRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: 'restaurant-1',
    ownerId: 'owner-1',
    name: 'Bella Napoli',
    description: null,
    addressLine: '14 Rivington Street',
    city: 'London',
    phone: null,
    imageUrl: null,
    deliveryFeeCents: 249,
    minimumOrderCents: 1200,
    isOpen: true,
    latitude: 51.5262,
    longitude: -0.0813,
    cuisines: ['italian'],
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
    id: 'item-margherita',
    restaurantId: 'restaurant-1',
    categoryId: null,
    name: 'Margherita',
    description: null,
    priceCents: 1050,
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CartService', () => {
  let service: CartService;

  const cart = {
    findByUser: jest.fn(),
    findOrCreate: jest.fn(),
    addItem: jest.fn(),
    setItemQuantity: jest.fn(),
    removeItem: jest.fn(),
    clearForUser: jest.fn(),
  };
  const restaurants = { requireById: jest.fn() };
  const menuItems = { findAnyById: jest.fn(), findOrderableItems: jest.fn() };
  const orders = { create: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CartRepository, useValue: cart },
        { provide: RestaurantsService, useValue: restaurants },
        { provide: MenuItemsService, useValue: menuItems },
        { provide: OrdersService, useValue: orders },
      ],
    }).compile();

    service = module.get(CartService);
  });

  it('prices the basket from the menu, not from anything stored', async () => {
    cart.findByUser.mockResolvedValue({
      id: 'cart-1',
      restaurantId: 'restaurant-1',
      items: [{ menuItemId: 'item-margherita', quantity: 2 }],
    });
    restaurants.requireById.mockResolvedValue(aRestaurant());
    // The dish has gone up since it was added to the basket.
    menuItems.findOrderableItems.mockResolvedValue([aMenuItem({ priceCents: 1200 })]);

    const view = await service.view(CUSTOMER);

    expect(view.items[0].unitPriceCents).toBe(1200);
    expect(view.subtotalCents).toBe(2400);
    expect(view.totalCents).toBe(2649);
    expect(view.canCheckout).toBe(true);
  });

  it('refuses a dish from a different restaurant', async () => {
    menuItems.findAnyById.mockResolvedValue(aMenuItem({ restaurantId: 'restaurant-2' }));
    cart.findByUser.mockResolvedValue({
      id: 'cart-1',
      restaurantId: 'restaurant-1',
      items: [],
    });
    restaurants.requireById.mockResolvedValue(aRestaurant());

    await expect(service.addItem(CUSTOMER, { menuItemId: 'item-x' })).rejects.toThrow(
      ConflictException,
    );

    expect(cart.addItem).not.toHaveBeenCalled();
  });

  it('keeps a sold-out line visible but out of the total', async () => {
    cart.findByUser.mockResolvedValue({
      id: 'cart-1',
      restaurantId: 'restaurant-1',
      items: [
        { menuItemId: 'item-margherita', quantity: 1 },
        { menuItemId: 'item-gone', quantity: 1 },
      ],
    });
    restaurants.requireById.mockResolvedValue(aRestaurant({ minimumOrderCents: 0 }));
    menuItems.findOrderableItems.mockResolvedValue([
      aMenuItem(),
      aMenuItem({ id: 'item-gone', name: 'Diavola', priceCents: 1390, isAvailable: false }),
    ]);

    const view = await service.view(CUSTOMER);

    expect(view.items).toHaveLength(2);
    // The customer can see what changed, but is not charged for it.
    expect(view.subtotalCents).toBe(1050);
  });

  it('blocks checkout below the restaurant minimum', async () => {
    cart.findByUser.mockResolvedValue({
      id: 'cart-1',
      restaurantId: 'restaurant-1',
      items: [{ menuItemId: 'item-margherita', quantity: 1 }],
    });
    restaurants.requireById.mockResolvedValue(aRestaurant({ minimumOrderCents: 5000 }));
    menuItems.findOrderableItems.mockResolvedValue([aMenuItem()]);

    const view = await service.view(CUSTOMER);
    expect(view.canCheckout).toBe(false);
    expect(view.blockers).toContain(MESSAGES.cart.belowMinimum);

    await expect(
      service.checkout(CUSTOMER, { deliveryAddress: '10 Downing Street' }),
    ).rejects.toThrow(ConflictException);

    expect(orders.create).not.toHaveBeenCalled();
  });

  it('clears the basket only after the order exists', async () => {
    cart.findByUser.mockResolvedValue({
      id: 'cart-1',
      restaurantId: 'restaurant-1',
      items: [{ menuItemId: 'item-margherita', quantity: 2 }],
    });
    restaurants.requireById.mockResolvedValue(aRestaurant());
    menuItems.findOrderableItems.mockResolvedValue([aMenuItem()]);
    // Order creation fails — the basket must survive so the customer can retry.
    orders.create.mockRejectedValue(new ConflictException('kitchen closed'));

    await expect(
      service.checkout(CUSTOMER, { deliveryAddress: '10 Downing Street' }),
    ).rejects.toThrow(ConflictException);

    expect(cart.clearForUser).not.toHaveBeenCalled();
  });
});
