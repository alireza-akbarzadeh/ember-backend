import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrdersService } from '../orders/orders.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';

const CUSTOMER: AuthenticatedUser = {
  id: 'customer-1',
  email: 'sam@example.com',
  role: 'customer',
};
const COURIER: AuthenticatedUser = {
  id: 'courier-1',
  email: 'courier@example.com',
  role: 'courier',
};

function anOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    customerId: CUSTOMER.id,
    restaurantId: 'restaurant-1',
    status: 'delivered',
    ...overrides,
  };
}

describe('ReviewsService', () => {
  let service: ReviewsService;

  const repository = { createAndRecompute: jest.fn(), findByRestaurant: jest.fn() };
  const orders = { getById: jest.fn() };
  const restaurants = { requireById: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: ReviewsRepository, useValue: repository },
        { provide: OrdersService, useValue: orders },
        { provide: RestaurantsService, useValue: restaurants },
      ],
    }).compile();

    service = module.get(ReviewsService);
  });

  it('records a review for the customer’s own delivered order', async () => {
    orders.getById.mockResolvedValue(anOrder());
    repository.createAndRecompute.mockImplementation((v: object) =>
      Promise.resolve({ id: 'review-1', comment: null, createdAt: new Date(), ...v }),
    );

    const review = await service.create(CUSTOMER, 'order-1', { rating: 5 });

    expect(review.rating).toBe(5);
    // Restaurant and customer come from the order, never from the request.
    expect(repository.createAndRecompute).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        restaurantId: 'restaurant-1',
        customerId: CUSTOMER.id,
      }),
    );
  });

  it('refuses anyone but the customer, even if they were involved', async () => {
    // The courier delivered it, so getById lets them read it — but delivering
    // a meal is not the same as having eaten it.
    orders.getById.mockResolvedValue(anOrder());

    await expect(service.create(COURIER, 'order-1', { rating: 1 })).rejects.toThrow(
      ForbiddenException,
    );

    expect(repository.createAndRecompute).not.toHaveBeenCalled();
  });

  it('refuses an order that has not arrived yet', async () => {
    orders.getById.mockResolvedValue(anOrder({ status: 'preparing' }));

    await expect(service.create(CUSTOMER, 'order-1', { rating: 5 })).rejects.toThrow(
      ConflictException,
    );

    expect(repository.createAndRecompute).not.toHaveBeenCalled();
  });

  it('turns a duplicate into a 409 rather than a 500', async () => {
    orders.getById.mockResolvedValue(anOrder());
    repository.createAndRecompute.mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'reviews_order_id_unique',
      }),
    );

    await expect(service.create(CUSTOMER, 'order-1', { rating: 5 })).rejects.toThrow(
      ConflictException,
    );
  });
});
