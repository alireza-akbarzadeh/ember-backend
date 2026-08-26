import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, SQL } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import { type NewOrderItem, orderItems } from '../../database/schema/order-items';
import { type NewOrder, type Order, type OrderStatus, orders } from '../../database/schema/orders';
import type { OrderWithItems } from './dto/order-response.dto';

export interface FindOrdersOptions {
  customerId?: string;
  courierId?: string;
  restaurantIds?: string[];
  status?: OrderStatus;
  unclaimedOnly?: boolean;
  limit: number;
  offset: number;
}

/** Line data minus the order id, which only exists once the order is inserted. */
export type NewOrderLine = Omit<NewOrderItem, 'orderId'>;

@Injectable()
export class OrdersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Writes the order and its lines atomically. A half-written order — a header
   * with no items, priced at zero — must never be reachable, so both inserts
   * share one transaction and fail together.
   */
  createWithItems(order: NewOrder, lines: NewOrderLine[]): Promise<OrderWithItems> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(orders).values(order).returning();

      const items = await tx
        .insert(orderItems)
        .values(lines.map((line) => ({ ...line, orderId: created.id })))
        .returning();

      return { ...created, items };
    });
  }

  /** Reads the order and its lines in one round trip, not one query per line. */
  async findById(id: string): Promise<OrderWithItems | null> {
    const order = await this.db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: { items: true },
    });

    return order ?? null;
  }

  findMany(options: FindOrdersOptions): Promise<OrderWithItems[]> {
    const filters: SQL[] = [];

    if (options.customerId) {
      filters.push(eq(orders.customerId, options.customerId));
    }
    if (options.courierId) {
      filters.push(eq(orders.courierId, options.courierId));
    }
    if (options.restaurantIds) {
      // An empty list must match nothing rather than everything — inArray with
      // no values would otherwise widen the query to every order in the table.
      if (options.restaurantIds.length === 0) return Promise.resolve([]);
      filters.push(inArray(orders.restaurantId, options.restaurantIds));
    }
    if (options.status) filters.push(eq(orders.status, options.status));
    if (options.unclaimedOnly) filters.push(isNull(orders.courierId));

    return this.db.query.orders.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
      with: { items: true },
      orderBy: [desc(orders.createdAt)],
      limit: options.limit,
      offset: options.offset,
    });
  }

  /**
   * Moves an order forward only if it is still where the caller thinks it is.
   *
   * The `status = expectedFrom` predicate is optimistic concurrency control:
   * two staff members acting on the same order at once produce one winner and
   * one 409, instead of silently overwriting each other.
   */
  async updateStatus(
    id: string,
    expectedFrom: OrderStatus,
    to: OrderStatus,
    timestamps: Pick<NewOrder, 'cancelledAt' | 'deliveredAt'> = {},
  ): Promise<Order | null> {
    const [order] = await this.db
      .update(orders)
      .set({ status: to, ...timestamps, updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.status, expectedFrom)))
      .returning();

    return order ?? null;
  }

  /**
   * Assigns a courier only while the order is still unclaimed and ready.
   *
   * Same conditional-update trick: couriers race for the same delivery, and
   * exactly one of them must win.
   */
  async claim(id: string, courierId: string): Promise<Order | null> {
    const [order] = await this.db
      .update(orders)
      .set({ courierId, updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.status, 'ready'), isNull(orders.courierId)))
      .returning();

    return order ?? null;
  }
}
