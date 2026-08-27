import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import { cartItems, type CartItem } from '../../database/schema/cart-items';
import { carts, type Cart } from '../../database/schema/carts';

export interface CartWithItems extends Cart {
  items: CartItem[];
}

@Injectable()
export class CartRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** The user's basket and its lines in one round trip, or null. */
  async findByUser(userId: string): Promise<CartWithItems | null> {
    const cart = await this.db.query.carts.findFirst({
      where: eq(carts.userId, userId),
      with: { items: true },
    });

    return cart ?? null;
  }

  /**
   * Returns the user's cart for `restaurantId`, creating it if there isn't one.
   *
   * `onConflictDoNothing` on the unique `user_id` handles two "add to cart"
   * taps arriving together: the loser reads the winner's row instead of
   * failing, which is what the customer meant.
   */
  async findOrCreate(userId: string, restaurantId: string): Promise<Cart> {
    const [created] = await this.db
      .insert(carts)
      .values({ userId, restaurantId })
      .onConflictDoNothing({ target: carts.userId })
      .returning();

    if (created) return created;

    const [existing] = await this.db.select().from(carts).where(eq(carts.userId, userId)).limit(1);

    return existing;
  }

  /**
   * Adds a dish, or adds to the count if it is already there.
   *
   * Done as an upsert rather than read-then-write so two rapid taps sum to two
   * rather than racing and landing on one.
   */
  async addItem(cartId: string, menuItemId: string, quantity: number): Promise<void> {
    await this.db
      .insert(cartItems)
      .values({ cartId, menuItemId, quantity })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.menuItemId],
        set: { quantity: sql`least(${cartItems.quantity} + ${quantity}, 50)` },
      });

    await this.touch(cartId);
  }

  async setItemQuantity(cartId: string, menuItemId: string, quantity: number): Promise<boolean> {
    const rows = await this.db
      .update(cartItems)
      .set({ quantity })
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.menuItemId, menuItemId)))
      .returning({ id: cartItems.id });

    await this.touch(cartId);
    return rows.length > 0;
  }

  async removeItem(cartId: string, menuItemId: string): Promise<boolean> {
    const rows = await this.db
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cartId), eq(cartItems.menuItemId, menuItemId)))
      .returning({ id: cartItems.id });

    await this.touch(cartId);
    return rows.length > 0;
  }

  /** Removes the cart entirely; `cart_items` cascade. */
  async clearForUser(userId: string): Promise<void> {
    await this.db.delete(carts).where(eq(carts.userId, userId));
  }

  private async touch(cartId: string): Promise<void> {
    await this.db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  }
}
