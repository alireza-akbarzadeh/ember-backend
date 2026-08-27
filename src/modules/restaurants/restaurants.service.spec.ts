import { Test } from '@nestjs/testing';
import type { Address } from '../../database/schema/addresses';
import type { Restaurant } from '../../database/schema/restaurants';
import { AddressesService } from '../addresses/addresses.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RestaurantsRepository } from './restaurants.repository';
import { RestaurantsService } from './restaurants.service';
import type { SearchRestaurantsOptions } from './restaurants.repository';

const CUSTOMER: AuthenticatedUser = {
  id: 'customer-1',
  email: 'sam@example.com',
  role: 'customer',
};

const HOME: Address = {
  id: 'address-1',
  userId: CUSTOMER.id,
  label: 'Home',
  line1: '31 Rivington Street',
  line2: null,
  city: 'London',
  postalCode: 'EC2A 3QQ',
  latitude: 51.5259,
  longitude: -0.0805,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
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

describe('RestaurantsService.browse', () => {
  let service: RestaurantsService;

  const repository = {
    search: jest.fn(),
    findById: jest.fn(),
    findIdsByOwner: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const addresses = { findDefault: jest.fn() };

  /** The options the service handed the repository on the last call. */
  function lastSearch(): SearchRestaurantsOptions {
    const calls = repository.search.mock.calls as [SearchRestaurantsOptions][];
    return calls[0][0];
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    repository.search.mockResolvedValue({ rows: [], total: 0 });

    const module = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: RestaurantsRepository, useValue: repository },
        { provide: AddressesService, useValue: addresses },
      ],
    }).compile();

    service = module.get(RestaurantsService);
  });

  describe('choosing where to measure from', () => {
    it('prefers coordinates the caller sent', async () => {
      await service.browse(
        { limit: 20, offset: 0, latitude: 51.4, longitude: -0.1, radiusKm: 5 },
        CUSTOMER,
      );

      expect(lastSearch().origin).toEqual({ latitude: 51.4, longitude: -0.1 });
      // An explicit pin must not trigger an address lookup.
      expect(addresses.findDefault).not.toHaveBeenCalled();
    });

    it('falls back to the caller’s default address', async () => {
      addresses.findDefault.mockResolvedValue(HOME);

      await service.browse({ limit: 20, offset: 0, radiusKm: 10 }, CUSTOMER);

      expect(lastSearch().origin).toEqual({
        latitude: HOME.latitude,
        longitude: HOME.longitude,
      });
    });

    it('searches without a location when the user has saved no address', async () => {
      addresses.findDefault.mockResolvedValue(null);

      await service.browse({ limit: 20, offset: 0, radiusKm: 10 }, CUSTOMER);

      const options = lastSearch();
      expect(options.origin).toBeUndefined();
      // Radius without an origin would silently filter nothing — and worse,
      // reads as though a distance limit were applied.
      expect(options.radiusKm).toBeUndefined();
    });

    it('never looks up an address for an anonymous caller', async () => {
      await service.browse({ limit: 20, offset: 0, radiusKm: 10 });

      expect(addresses.findDefault).not.toHaveBeenCalled();
      expect(lastSearch().origin).toBeUndefined();
    });
  });

  describe('filters', () => {
    it('passes every filter through untouched', async () => {
      addresses.findDefault.mockResolvedValue(null);

      await service.browse(
        {
          limit: 20,
          offset: 0,
          search: 'sushi',
          city: 'London',
          cuisine: ['japanese'],
          priceLevel: [3, 4],
          minRating: 4,
          maxDeliveryFeeCents: 300,
          openNow: true,
          sort: 'deliveryFee',
        },
        CUSTOMER,
      );

      expect(lastSearch()).toMatchObject({
        search: 'sushi',
        city: 'London',
        cuisine: ['japanese'],
        priceLevel: [3, 4],
        minRating: 4,
        maxDeliveryFeeCents: 300,
        openNow: true,
        sort: 'deliveryFee',
      });
    });
  });

  describe('response shape', () => {
    it('returns a paginated envelope with a real total', async () => {
      addresses.findDefault.mockResolvedValue(null);
      repository.search.mockResolvedValue({
        rows: [{ ...aRestaurant(), distanceKm: null }],
        total: 42,
      });

      const page = await service.browse({ limit: 20, offset: 0 }, CUSTOMER);

      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(42);
      expect(page.hasMore).toBe(true);
    });

    it('reports hasMore false on the last page', async () => {
      addresses.findDefault.mockResolvedValue(null);
      repository.search.mockResolvedValue({
        rows: [{ ...aRestaurant(), distanceKm: null }],
        total: 21,
      });

      const page = await service.browse({ limit: 20, offset: 20 }, CUSTOMER);

      expect(page.hasMore).toBe(false);
    });

    it('rounds distance to one decimal', async () => {
      addresses.findDefault.mockResolvedValue(HOME);
      repository.search.mockResolvedValue({
        rows: [{ ...aRestaurant(), distanceKm: 1.43829 }],
        total: 1,
      });

      const page = await service.browse({ limit: 20, offset: 0 }, CUSTOMER);

      expect(page.items[0].distanceKm).toBe(1.4);
    });

    it('reports a null distance when nothing was measured from', async () => {
      addresses.findDefault.mockResolvedValue(null);
      repository.search.mockResolvedValue({
        rows: [{ ...aRestaurant(), distanceKm: null }],
        total: 1,
      });

      const page = await service.browse({ limit: 20, offset: 0 }, CUSTOMER);

      expect(page.items[0].distanceKm).toBeNull();
    });
  });
});
