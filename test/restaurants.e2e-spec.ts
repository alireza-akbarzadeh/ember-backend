import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DRIZZLE, type Database } from '../src/database/database.constants';
import { orders } from '../src/database/schema/orders';
import { restaurants } from '../src/database/schema/restaurants';
import { users, type UserRole } from '../src/database/schema/users';

interface Session {
  accessToken: string;
  user: { id: string; email: string; role: string };
}

function jsonBody<T>(response: request.Response): T {
  return response.body as T;
}

/**
 * Exercises the paths unit tests necessarily mock: real SQL, the order
 * transaction, and the relational load of an order's lines.
 *
 * Point DATABASE_URL at a throwaway Postgres/Neon branch and run
 * `pnpm db:migrate` against it first. Everything created here is removed in
 * `afterAll`, in FK order.
 */
describe('Restaurants, menus and orders (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let db: Database;

  const createdEmails: string[] = [];
  const createdRestaurantIds: string[] = [];

  /**
   * Registers an account and, when a privileged role is wanted, sets it
   * directly in the database — the same bootstrap an operator performs for the
   * very first admin. No API path grants a role to a fresh account.
   */
  async function signUp(role: UserRole = 'customer'): Promise<Session> {
    const email = `e2e-${randomUUID()}@example.com`;
    createdEmails.push(email);

    const response = await request(server)
      .post('/api/auth/register')
      .send({ email, password: 'correct horse battery', fullName: 'E2E User' })
      .expect(201);

    const session = jsonBody<Session>(response);

    if (role !== 'customer') {
      await db.update(users).set({ role }).where(eq(users.id, session.user.id));
      // JwtStrategy re-reads the row on every request, so the token issued a
      // moment ago already carries the new role — no re-login needed.
      session.user.role = role;
    }

    return session;
  }

  async function createRestaurant(owner: Session): Promise<string> {
    const response = await request(server)
      .post('/api/restaurants')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Ember Grill',
        addressLine: '221B Baker Street',
        city: `London-${randomUUID().slice(0, 8)}`,
        deliveryFeeCents: 299,
      })
      .expect(201);

    const { id } = jsonBody<{ id: string }>(response);
    createdRestaurantIds.push(id);

    return id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app, app.get(ConfigService));
    await app.init();

    server = app.getHttpServer() as App;
    db = app.get<Database>(DRIZZLE);
  });

  afterAll(async () => {
    // FK order: orders reference restaurants and users with ON DELETE RESTRICT.
    if (createdRestaurantIds.length > 0) {
      await db.delete(orders).where(inArray(orders.restaurantId, createdRestaurantIds));
      await db.delete(restaurants).where(inArray(restaurants.id, createdRestaurantIds));
    }
    if (createdEmails.length > 0) {
      await db.delete(users).where(inArray(users.email, createdEmails));
    }
    await app.close();
  });

  describe('restaurant ownership', () => {
    it('refuses restaurant creation to a plain customer', async () => {
      const customer = await signUp();

      await request(server)
        .post('/api/restaurants')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          name: 'Not Mine',
          addressLine: '1 Some Road',
          city: 'London',
        })
        .expect(403);
    });

    it('assigns the caller as owner, ignoring anything in the body', async () => {
      const owner = await signUp('restaurant_owner');
      const someoneElse = await signUp();

      const response = await request(server)
        .post('/api/restaurants')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          name: 'Ember Grill',
          addressLine: '221B Baker Street',
          city: 'London',
          // There is no ownerId field on the DTO, so this is rejected outright
          // rather than silently ignored.
          ownerId: someoneElse.user.id,
        })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('ownerId');
    });

    it('stops one owner editing another owner’s restaurant', async () => {
      const owner = await signUp('restaurant_owner');
      const intruder = await signUp('restaurant_owner');
      const restaurantId = await createRestaurant(owner);

      await request(server)
        .patch(`/api/restaurants/${restaurantId}`)
        .set('Authorization', `Bearer ${intruder.accessToken}`)
        .send({ name: 'Hijacked' })
        .expect(403);
    });
  });

  describe('menu with categories', () => {
    it('serves the restaurant page grouped by section', async () => {
      const owner = await signUp('restaurant_owner');
      const customer = await signUp();
      const restaurantId = await createRestaurant(owner);

      const category = jsonBody<{ id: string }>(
        await request(server)
          .post(`/api/restaurants/${restaurantId}/categories`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ name: 'Burgers', sortOrder: 0 })
          .expect(201),
      );

      await request(server)
        .post(`/api/restaurants/${restaurantId}/menu-items`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          name: 'Smash Burger',
          priceCents: 1250,
          categoryId: category.id,
        })
        .expect(201);

      await request(server)
        .post(`/api/restaurants/${restaurantId}/menu-items`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Tap Water', priceCents: 0 })
        .expect(400); // priceCents has a minimum of 1

      await request(server)
        .post(`/api/restaurants/${restaurantId}/menu-items`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Sparkling Water', priceCents: 200 })
        .expect(201);

      const menu = jsonBody<{
        restaurant: { id: string };
        categories: Array<{ name: string; items: Array<{ name: string }> }>;
        uncategorizedItems: Array<{ name: string }>;
      }>(
        await request(server)
          .get(`/api/restaurants/${restaurantId}/menu`)
          .set('Authorization', `Bearer ${customer.accessToken}`)
          .expect(200),
      );

      expect(menu.restaurant.id).toBe(restaurantId);
      expect(menu.categories).toHaveLength(1);
      expect(menu.categories[0].name).toBe('Burgers');
      expect(menu.categories[0].items.map((i) => i.name)).toEqual(['Smash Burger']);
      expect(menu.uncategorizedItems.map((i) => i.name)).toEqual(['Sparkling Water']);
    });

    it('rejects a duplicate category name within one restaurant', async () => {
      const owner = await signUp('restaurant_owner');
      const restaurantId = await createRestaurant(owner);

      await request(server)
        .post(`/api/restaurants/${restaurantId}/categories`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Burgers' })
        .expect(201);

      await request(server)
        .post(`/api/restaurants/${restaurantId}/categories`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Burgers' })
        .expect(409);
    });

    it('refuses a category owned by a different restaurant', async () => {
      const owner = await signUp('restaurant_owner');
      const mine = await createRestaurant(owner);
      const other = await createRestaurant(owner);

      const foreign = jsonBody<{ id: string }>(
        await request(server)
          .post(`/api/restaurants/${other}/categories`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ name: 'Drinks' })
          .expect(201),
      );

      await request(server)
        .post(`/api/restaurants/${mine}/menu-items`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({
          name: 'Smash Burger',
          priceCents: 1250,
          categoryId: foreign.id,
        })
        .expect(404);
    });

    it('hides sold-out items from customers but shows them to the owner', async () => {
      const owner = await signUp('restaurant_owner');
      const customer = await signUp();
      const restaurantId = await createRestaurant(owner);

      await request(server)
        .post(`/api/restaurants/${restaurantId}/menu-items`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: 'Sold Out Special', priceCents: 900, isAvailable: false })
        .expect(201);

      const asCustomer = jsonBody<unknown[]>(
        await request(server)
          .get(`/api/restaurants/${restaurantId}/menu-items`)
          .set('Authorization', `Bearer ${customer.accessToken}`)
          .expect(200),
      );
      const asOwner = jsonBody<unknown[]>(
        await request(server)
          .get(`/api/restaurants/${restaurantId}/menu-items`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200),
      );

      expect(asCustomer).toHaveLength(0);
      expect(asOwner).toHaveLength(1);
    });
  });

  describe('placing an order', () => {
    async function setUpMenu() {
      const owner = await signUp('restaurant_owner');
      const restaurantId = await createRestaurant(owner);

      const item = jsonBody<{ id: string }>(
        await request(server)
          .post(`/api/restaurants/${restaurantId}/menu-items`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ name: 'Smash Burger', priceCents: 1250 })
          .expect(201),
      );

      return { owner, restaurantId, itemId: item.id };
    }

    it('prices the order server-side and stores its lines', async () => {
      const { restaurantId, itemId } = await setUpMenu();
      const customer = await signUp();

      const order = jsonBody<{
        id: string;
        status: string;
        subtotalCents: number;
        deliveryFeeCents: number;
        totalCents: number;
        items: Array<{ name: string; unitPriceCents: number; quantity: number }>;
      }>(
        await request(server)
          .post('/api/orders')
          .set('Authorization', `Bearer ${customer.accessToken}`)
          .send({
            restaurantId,
            items: [{ menuItemId: itemId, quantity: 2 }],
            deliveryAddress: '10 Downing Street',
          })
          .expect(201),
      );

      expect(order.status).toBe('pending');
      expect(order.subtotalCents).toBe(2500);
      expect(order.deliveryFeeCents).toBe(299);
      expect(order.totalCents).toBe(2799);
      expect(order.items).toHaveLength(1);
      expect(order.items[0]).toMatchObject({
        name: 'Smash Burger',
        unitPriceCents: 1250,
        quantity: 2,
      });
    });

    it('ignores a client-supplied price entirely', async () => {
      const { restaurantId, itemId } = await setUpMenu();
      const customer = await signUp();

      // No price field exists on the DTO, so forbidNonWhitelisted rejects it
      // rather than the server quietly honouring a 1-cent burger.
      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          restaurantId,
          items: [{ menuItemId: itemId, quantity: 1 }],
          deliveryAddress: '10 Downing Street',
          totalCents: 1,
        })
        .expect(400);
    });

    it('refuses an item from another restaurant', async () => {
      const first = await setUpMenu();
      const second = await setUpMenu();
      const customer = await signUp();

      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          restaurantId: first.restaurantId,
          items: [{ menuItemId: second.itemId, quantity: 1 }],
          deliveryAddress: '10 Downing Street',
        })
        .expect(400);
    });

    it('hides an order from anyone uninvolved', async () => {
      const { restaurantId, itemId } = await setUpMenu();
      const customer = await signUp();
      const stranger = await signUp();

      const order = jsonBody<{ id: string }>(
        await request(server)
          .post('/api/orders')
          .set('Authorization', `Bearer ${customer.accessToken}`)
          .send({
            restaurantId,
            items: [{ menuItemId: itemId, quantity: 1 }],
            deliveryAddress: '10 Downing Street',
          })
          .expect(201),
      );

      await request(server)
        .get(`/api/orders/${order.id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      await request(server)
        .get(`/api/orders/${order.id}`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(200);
    });
  });

  describe('order lifecycle', () => {
    it('runs the full journey to delivered', async () => {
      const owner = await signUp('restaurant_owner');
      const customer = await signUp();
      const courier = await signUp('courier');
      const restaurantId = await createRestaurant(owner);

      const item = jsonBody<{ id: string }>(
        await request(server)
          .post(`/api/restaurants/${restaurantId}/menu-items`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ name: 'Smash Burger', priceCents: 1250 })
          .expect(201),
      );

      const order = jsonBody<{ id: string }>(
        await request(server)
          .post('/api/orders')
          .set('Authorization', `Bearer ${customer.accessToken}`)
          .send({
            restaurantId,
            items: [{ menuItemId: item.id, quantity: 1 }],
            deliveryAddress: '10 Downing Street',
          })
          .expect(201),
      );

      const setStatus = (token: string, status: string) =>
        request(server)
          .patch(`/api/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${token}`)
          .send({ status });

      // The customer cannot confirm their own order.
      await setStatus(customer.accessToken, 'confirmed').expect(403);
      // Nor skip the kitchen.
      await setStatus(owner.accessToken, 'delivered').expect(409);

      await setStatus(owner.accessToken, 'confirmed').expect(200);
      await setStatus(owner.accessToken, 'preparing').expect(200);
      // Once cooking starts the customer can no longer cancel.
      await setStatus(customer.accessToken, 'cancelled').expect(403);
      await setStatus(owner.accessToken, 'ready').expect(200);

      // A courier cannot pick up an order that is not theirs yet.
      await setStatus(courier.accessToken, 'picked_up').expect(404);

      await request(server)
        .post(`/api/orders/${order.id}/claim`)
        .set('Authorization', `Bearer ${courier.accessToken}`)
        .expect(200);

      // Claiming twice loses to the first writer.
      await request(server)
        .post(`/api/orders/${order.id}/claim`)
        .set('Authorization', `Bearer ${courier.accessToken}`)
        .expect(409);

      await setStatus(courier.accessToken, 'picked_up').expect(200);

      const delivered = jsonBody<{ status: string; deliveredAt: string | null }>(
        await setStatus(courier.accessToken, 'delivered').expect(200),
      );

      expect(delivered.status).toBe('delivered');
      expect(delivered.deliveredAt).not.toBeNull();

      // Terminal means terminal, even for the restaurant.
      await setStatus(owner.accessToken, 'cancelled').expect(409);
    });

    it('scopes the order list to each party’s own view', async () => {
      const owner = await signUp('restaurant_owner');
      const customer = await signUp();
      const otherCustomer = await signUp();
      const restaurantId = await createRestaurant(owner);

      const item = jsonBody<{ id: string }>(
        await request(server)
          .post(`/api/restaurants/${restaurantId}/menu-items`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ name: 'Smash Burger', priceCents: 1250 })
          .expect(201),
      );

      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          restaurantId,
          items: [{ menuItemId: item.id, quantity: 1 }],
          deliveryAddress: '10 Downing Street',
        })
        .expect(201);

      const mine = jsonBody<unknown[]>(
        await request(server)
          .get('/api/orders')
          .set('Authorization', `Bearer ${customer.accessToken}`)
          .expect(200),
      );
      const theirs = jsonBody<unknown[]>(
        await request(server)
          .get('/api/orders')
          .set('Authorization', `Bearer ${otherCustomer.accessToken}`)
          .expect(200),
      );
      const kitchen = jsonBody<unknown[]>(
        await request(server)
          .get('/api/orders')
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200),
      );

      expect(mine).toHaveLength(1);
      expect(theirs).toHaveLength(0);
      expect(kitchen).toHaveLength(1);
    });
  });
});
