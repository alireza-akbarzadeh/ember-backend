import 'dotenv/config';
import * as argon2 from 'argon2';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { addresses } from '../src/database/schema/addresses';
import { menuCategories } from '../src/database/schema/menu-categories';
import { menuItems } from '../src/database/schema/menu-items';
import { orders } from '../src/database/schema/orders';
import { restaurants } from '../src/database/schema/restaurants';
import { users, type UserRole } from '../src/database/schema/users';
import { SEED_ADDRESSES, SEED_RESTAURANTS } from './seed-data';

/**
 * Development seed.
 *
 * Idempotent: it only ever touches accounts under `@ember.seed`, so running it
 * twice is safe and it can never delete real data. Re-running replaces the
 * seeded restaurants with a fresh copy.
 *
 *   pnpm db:seed
 */

const SEED_DOMAIN = '@ember.seed';
const SEED_PASSWORD = 'seed password 123';

const SEED_ACCOUNTS: Array<{ email: string; fullName: string; role: UserRole }> = [
  { email: `owner${SEED_DOMAIN}`, fullName: 'Olivia Owner', role: 'restaurant_owner' },
  { email: `admin${SEED_DOMAIN}`, fullName: 'Adam Admin', role: 'admin' },
  { email: `courier${SEED_DOMAIN}`, fullName: 'Cara Courier', role: 'courier' },
  { email: `customer${SEED_DOMAIN}`, fullName: 'Chris Customer', role: 'customer' },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Seeding writes to a real database — point it at a development branch.',
    );
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, {
    schema: { users, restaurants, menuCategories, menuItems, addresses, orders },
  });

  try {
    const passwordHash = await argon2.hash(SEED_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    console.log('Seeding accounts…');
    const accountIds = new Map<UserRole, string>();

    for (const account of SEED_ACCOUNTS) {
      // onConflictDoUpdate rather than delete-and-insert: these users own
      // restaurants and orders, and deleting them would cascade further than
      // a seed script has any business reaching.
      const [row] = await db
        .insert(users)
        .values({ ...account, passwordHash })
        .onConflictDoUpdate({
          target: users.email,
          set: { fullName: account.fullName, role: account.role, passwordHash },
        })
        .returning({ id: users.id });

      accountIds.set(account.role, row.id);
    }

    const ownerId = accountIds.get('restaurant_owner');
    const customerId = accountIds.get('customer');
    if (!ownerId || !customerId) throw new Error('Seed accounts missing');

    console.log('Clearing previously seeded restaurants…');
    const existing = await db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.ownerId, ownerId));

    if (existing.length > 0) {
      const ids = existing.map((row) => row.id);
      // orders reference restaurants with ON DELETE RESTRICT, so any test
      // orders against seeded restaurants have to go first.
      await db.delete(orders).where(inArray(orders.restaurantId, ids));
      // menu_categories and menu_items cascade from restaurants.
      await db.delete(restaurants).where(inArray(restaurants.id, ids));
    }

    console.log(`Seeding ${SEED_RESTAURANTS.length} restaurants…`);
    let itemCount = 0;

    for (const seed of SEED_RESTAURANTS) {
      const { categories, ...restaurantFields } = seed;

      const [restaurant] = await db
        .insert(restaurants)
        .values({ ...restaurantFields, ownerId })
        .returning({ id: restaurants.id });

      for (const category of categories) {
        const [inserted] = await db
          .insert(menuCategories)
          .values({
            restaurantId: restaurant.id,
            name: category.name,
            sortOrder: category.sortOrder,
          })
          .returning({ id: menuCategories.id });

        await db.insert(menuItems).values(
          category.items.map((item) => ({
            restaurantId: restaurant.id,
            categoryId: inserted.id,
            name: item.name,
            description: item.description,
            priceCents: item.priceCents,
            isAvailable: item.isAvailable ?? true,
          })),
        );

        itemCount += category.items.length;
      }
    }

    console.log('Seeding customer addresses…');
    await db.delete(addresses).where(eq(addresses.userId, customerId));
    await db
      .insert(addresses)
      .values(SEED_ADDRESSES.map((address) => ({ ...address, userId: customerId })));

    console.log('\nDone.');
    console.log(`  ${SEED_RESTAURANTS.length} restaurants, ${itemCount} menu items`);
    console.log(`  ${SEED_ACCOUNTS.length} accounts, password: ${SEED_PASSWORD}`);
    for (const account of SEED_ACCOUNTS) {
      console.log(`    ${account.role.padEnd(16)} ${account.email}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
