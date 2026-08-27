import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import { orders } from '../../database/schema/orders';
import {
  payments,
  type NewPayment,
  type Payment,
  type PaymentStatus,
} from '../../database/schema/payments';

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findByOrder(orderId: string): Promise<Payment | null> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .limit(1);

    return payment ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, key))
      .limit(1);

    return payment ?? null;
  }

  async findById(id: string): Promise<Payment | null> {
    const [payment] = await this.db.select().from(payments).where(eq(payments.id, id)).limit(1);

    return payment ?? null;
  }

  /**
   * Records the attempt before contacting the provider.
   *
   * Writing `pending` first is what makes the unique index on
   * `idempotency_key` useful: the row exists before any money moves, so a
   * concurrent retry collides here rather than reaching the provider twice.
   */
  async createPending(values: NewPayment): Promise<Payment> {
    const [payment] = await this.db.insert(payments).values(values).returning();
    return payment;
  }

  /**
   * Marks the payment captured and the order paid, atomically.
   *
   * `orders.paid_at` is what lets a restaurant confirm the order. If it were
   * written separately and that write failed, the customer would be charged
   * for an order the kitchen is forbidden to start.
   */
  async markCaptured(id: string, orderId: string, providerRef: string): Promise<Payment> {
    return this.db.transaction(async (tx) => {
      const now = new Date();

      const [payment] = await tx
        .update(payments)
        .set({ status: 'captured', providerRef, capturedAt: now, updatedAt: now })
        .where(eq(payments.id, id))
        .returning();

      await tx.update(orders).set({ paidAt: now, updatedAt: now }).where(eq(orders.id, orderId));

      return payment;
    });
  }

  async markFailed(id: string, reason: string): Promise<Payment> {
    const [payment] = await this.db
      .update(payments)
      .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();

    return payment;
  }

  /** Refunding also clears `orders.paid_at` — the order is no longer paid for. */
  async markRefunded(id: string, orderId: string): Promise<Payment> {
    return this.db.transaction(async (tx) => {
      const now = new Date();

      const [payment] = await tx
        .update(payments)
        .set({ status: 'refunded', refundedAt: now, updatedAt: now })
        .where(eq(payments.id, id))
        .returning();

      await tx.update(orders).set({ paidAt: null, updatedAt: now }).where(eq(orders.id, orderId));

      return payment;
    });
  }

  async updateStatus(id: string, status: PaymentStatus): Promise<Payment> {
    const [payment] = await this.db
      .update(payments)
      .set({ status, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();

    return payment;
  }
}
