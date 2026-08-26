import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MenuItem } from '../../database/schema/menu-items';
import type { OrderItem } from '../../database/schema/order-items';
import type { Order } from '../../database/schema/orders';
import type { Restaurant } from '../../database/schema/restaurants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MenuItemsService } from '../restaurants/menu-items.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import type { OrderWithItems } from './dto/order-response.dto';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

const CUSTOMER: AuthenticatedUser = {
  id: 'customer-1',
  email: 'sam@example.com',
  role: 'customer',
};
const OWNER: AuthenticatedUser = {
  id: 'owner-1',
  email: 'owner@example.com',
  role: 'restaurant_owner',
};
const COURIER: AuthenticatedUser = {
  id: 'courier-1',
  email: 'courier@example.com',
  role: 'courier',
};
const STRANGER: AuthenticatedUser = {
  id: 'nobody-1',
  email: 'nobody@example.com',
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
    deliveryFeeCents: 299,
    isOpen: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function aMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-burger',
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

function anOrder(overrides: Partial<Order> = {}): OrderWithItems {
  return {
    id: 'order-1',
    customerId: CUSTOMER.id,
    restaurantId: 'restaurant-1',
    courierId: null,
    status: 'pending',
    subtotalCents: 1250,
    deliveryFeeCents: 299,
    totalCents: 1549,
    deliveryAddress: '10 Downing Street',
    deliveryNotes: null,
    cancelledAt: null,
    deliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [] as OrderItem[],
    ...overrides,
  };
}

describe('OrdersService', () => {
  let service: OrdersService;

  const repository = {
    createWithItems: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    updateStatus: jest.fn(),
    claim: jest.fn(),
  };

  const restaurants = {
    requireById: jest.fn(),
    requireOwned: jest.fn(),
    listOwnedIds: jest.fn(),
  };

  const menuItems = {
    findOrderableItems: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrdersRepository, useValue: repository },
        { provide: RestaurantsService, useValue: restaurants },
        { provide: MenuItemsService, useValue: menuItems },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  describe('create', () => {
    it('prices the order from the menu, not from the request', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant());
      menuItems.findOrderableItems.mockResolvedValue([aMenuItem()]);
      repository.createWithItems.mockImplementation((order: Order) =>
        Promise.resolve({ ...anOrder(), ...order, items: [] }),
      );

      await service.create(CUSTOMER, {
        restaurantId: 'restaurant-1',
        items: [{ menuItemId: 'item-burger', quantity: 2 }],
        deliveryAddress: '10 Downing Street',
      });

      const [order, lines] = repository.createWithItems.mock.calls[0] as [
        Record<string, number>,
        Array<Record<string, number>>,
      ];

      expect(lines[0].unitPriceCents).toBe(1250);
      expect(lines[0].lineTotalCents).toBe(2500);
      expect(order.subtotalCents).toBe(2500);
      expect(order.deliveryFeeCents).toBe(299);
      expect(order.totalCents).toBe(2799);
    });

    it('snapshots the item name so a later rename cannot rewrite history', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant());
      menuItems.findOrderableItems.mockResolvedValue([aMenuItem()]);
      repository.createWithItems.mockResolvedValue(anOrder());

      await service.create(CUSTOMER, {
        restaurantId: 'restaurant-1',
        items: [{ menuItemId: 'item-burger', quantity: 1 }],
        deliveryAddress: '10 Downing Street',
      });

      const [, lines] = repository.createWithItems.mock.calls[0] as [
        unknown,
        Array<Record<string, string>>,
      ];

      expect(lines[0].nameSnapshot).toBe('Smash Burger');
    });

    it('sums duplicate lines for the same dish into one', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant());
      menuItems.findOrderableItems.mockResolvedValue([aMenuItem()]);
      repository.createWithItems.mockResolvedValue(anOrder());

      await service.create(CUSTOMER, {
        restaurantId: 'restaurant-1',
        items: [
          { menuItemId: 'item-burger', quantity: 1 },
          { menuItemId: 'item-burger', quantity: 2 },
        ],
        deliveryAddress: '10 Downing Street',
      });

      const [, lines] = repository.createWithItems.mock.calls[0] as [
        unknown,
        Array<Record<string, number>>,
      ];

      expect(lines).toHaveLength(1);
      expect(lines[0].quantity).toBe(3);
      expect(lines[0].lineTotalCents).toBe(3750);
    });

    it('attributes the order to the caller, not to anything in the body', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant());
      menuItems.findOrderableItems.mockResolvedValue([aMenuItem()]);
      repository.createWithItems.mockResolvedValue(anOrder());

      await service.create(CUSTOMER, {
        restaurantId: 'restaurant-1',
        items: [{ menuItemId: 'item-burger', quantity: 1 }],
        deliveryAddress: '10 Downing Street',
      });

      const [order] = repository.createWithItems.mock.calls[0] as [{ customerId: string }];

      expect(order.customerId).toBe(CUSTOMER.id);
    });

    it('refuses an item that is not on this restaurant’s menu', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant());
      // The scoped lookup simply doesn't return another restaurant's item.
      menuItems.findOrderableItems.mockResolvedValue([]);

      await expect(
        service.create(CUSTOMER, {
          restaurantId: 'restaurant-1',
          items: [{ menuItemId: 'item-from-elsewhere', quantity: 1 }],
          deliveryAddress: '10 Downing Street',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(repository.createWithItems).not.toHaveBeenCalled();
    });

    it('refuses a sold-out item', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant());
      menuItems.findOrderableItems.mockResolvedValue([aMenuItem({ isAvailable: false })]);

      await expect(
        service.create(CUSTOMER, {
          restaurantId: 'restaurant-1',
          items: [{ menuItemId: 'item-burger', quantity: 1 }],
          deliveryAddress: '10 Downing Street',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a closed restaurant before touching the menu', async () => {
      restaurants.requireById.mockResolvedValue(aRestaurant({ isOpen: false }));

      await expect(
        service.create(CUSTOMER, {
          restaurantId: 'restaurant-1',
          items: [{ menuItemId: 'item-burger', quantity: 1 }],
          deliveryAddress: '10 Downing Street',
        }),
      ).rejects.toThrow(ConflictException);

      expect(menuItems.findOrderableItems).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('shows the order to the customer who placed it', async () => {
      repository.findById.mockResolvedValue(anOrder());

      const result = await service.getById(CUSTOMER, 'order-1');

      expect(result.id).toBe('order-1');
    });

    it('shows the order to the owner of its restaurant', async () => {
      repository.findById.mockResolvedValue(anOrder());
      restaurants.requireById.mockResolvedValue(aRestaurant());

      await expect(service.getById(OWNER, 'order-1')).resolves.toMatchObject({
        id: 'order-1',
      });
    });

    it('hides it behind a 404 from anyone uninvolved', async () => {
      repository.findById.mockResolvedValue(anOrder());

      // 404 rather than 403: a stranger guessing UUIDs should not be able to
      // learn which ones exist.
      await expect(service.getById(STRANGER, 'order-1')).rejects.toThrow(NotFoundException);
    });

    it('gives a courier nothing until they are the assigned one', async () => {
      repository.findById.mockResolvedValue(anOrder({ status: 'ready' }));

      await expect(service.getById(COURIER, 'order-1')).rejects.toThrow(NotFoundException);

      repository.findById.mockResolvedValue(anOrder({ status: 'ready', courierId: COURIER.id }));

      await expect(service.getById(COURIER, 'order-1')).resolves.toMatchObject({
        id: 'order-1',
      });
    });
  });

  describe('updateStatus', () => {
    it('lets the restaurant owner confirm a pending order', async () => {
      repository.findById.mockResolvedValue(anOrder());
      restaurants.requireById.mockResolvedValue(aRestaurant());
      repository.updateStatus.mockResolvedValue(anOrder({ status: 'confirmed' }));

      const result = await service.updateStatus(OWNER, 'order-1', {
        status: 'confirmed',
      });

      expect(result.status).toBe('confirmed');
      expect(repository.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'pending',
        'confirmed',
        expect.anything(),
      );
    });

    it('stops the customer confirming their own order', async () => {
      repository.findById.mockResolvedValue(anOrder());

      await expect(
        service.updateStatus(CUSTOMER, 'order-1', { status: 'confirmed' }),
      ).rejects.toThrow(/not allowed/i);

      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('reports an impossible jump as a conflict, not a permissions problem', async () => {
      repository.findById.mockResolvedValue(anOrder());

      await expect(
        service.updateStatus(CUSTOMER, 'order-1', { status: 'delivered' }),
      ).rejects.toThrow(ConflictException);
    });

    it('stamps cancelledAt when an order is cancelled', async () => {
      repository.findById.mockResolvedValue(anOrder());
      repository.updateStatus.mockResolvedValue(anOrder({ status: 'cancelled' }));

      await service.updateStatus(CUSTOMER, 'order-1', { status: 'cancelled' });

      const [, , , timestamps] = repository.updateStatus.mock.calls[0] as [
        string,
        string,
        string,
        { cancelledAt?: Date; deliveredAt?: Date },
      ];

      expect(timestamps.cancelledAt).toBeInstanceOf(Date);
      expect(timestamps.deliveredAt).toBeUndefined();
    });

    it('turns a lost concurrent update into a 409 rather than a silent overwrite', async () => {
      repository.findById.mockResolvedValue(anOrder());
      restaurants.requireById.mockResolvedValue(aRestaurant());
      // Someone else moved the order between the read and the write.
      repository.updateStatus.mockResolvedValue(null);

      await expect(service.updateStatus(OWNER, 'order-1', { status: 'confirmed' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('claim', () => {
    it('hands the delivery to the first courier who asks', async () => {
      repository.findById.mockResolvedValue(anOrder({ status: 'ready' }));
      repository.claim.mockResolvedValue(anOrder({ status: 'ready', courierId: COURIER.id }));

      const result = await service.claim(COURIER, 'order-1');

      expect(result.courierId).toBe(COURIER.id);
      expect(repository.claim).toHaveBeenCalledWith('order-1', COURIER.id);
    });

    it('turns down a courier who lost the race', async () => {
      repository.findById.mockResolvedValue(anOrder({ status: 'ready' }));
      // The conditional update matched no row: already claimed, or not ready.
      repository.claim.mockResolvedValue(null);

      await expect(service.claim(COURIER, 'order-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('list', () => {
    it('scopes a customer to their own orders', async () => {
      repository.findMany.mockResolvedValue([]);

      await service.list(CUSTOMER, { limit: 20, offset: 0 });

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: CUSTOMER.id }),
      );
    });

    it('scopes a courier to their own deliveries', async () => {
      repository.findMany.mockResolvedValue([]);

      await service.list(COURIER, { limit: 20, offset: 0 });

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ courierId: COURIER.id }),
      );
    });

    it('scopes an owner to the restaurants they run', async () => {
      restaurants.listOwnedIds.mockResolvedValue(['restaurant-1']);
      repository.findMany.mockResolvedValue([]);

      await service.list(OWNER, { limit: 20, offset: 0 });

      expect(repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ restaurantIds: ['restaurant-1'] }),
      );
    });

    it('checks ownership before honouring a restaurantId filter', async () => {
      restaurants.requireOwned.mockRejectedValue(new NotFoundException());

      await expect(
        service.list(STRANGER, {
          limit: 20,
          offset: 0,
          restaurantId: 'restaurant-1',
        }),
      ).rejects.toThrow();

      expect(repository.findMany).not.toHaveBeenCalled();
    });
  });
});
