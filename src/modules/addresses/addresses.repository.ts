import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import { addresses, type Address, type NewAddress } from '../../database/schema/addresses';

@Injectable()
export class AddressesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: string): Promise<Address | null> {
    const [address] = await this.db.select().from(addresses).where(eq(addresses.id, id)).limit(1);

    return address ?? null;
  }

  findByUser(userId: string): Promise<Address[]> {
    return this.db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(desc(addresses.isDefault), asc(addresses.createdAt));
  }

  async findDefaultForUser(userId: string): Promise<Address | null> {
    const [address] = await this.db
      .select()
      .from(addresses)
      .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
      .limit(1);

    return address ?? null;
  }

  /**
   * Writes an address, optionally making it the default.
   *
   * Clearing the previous default and setting the new one happen in one
   * transaction: a partial unique index enforces at most one default per user,
   * so doing them separately would either violate the constraint or leave the
   * user with none if the second statement failed.
   */
  async insert(values: NewAddress): Promise<Address> {
    return this.db.transaction(async (tx) => {
      if (values.isDefault) {
        await tx
          .update(addresses)
          .set({ isDefault: false })
          .where(and(eq(addresses.userId, values.userId), eq(addresses.isDefault, true)));
      }

      const [address] = await tx.insert(addresses).values(values).returning();
      return address;
    });
  }

  async update(
    id: string,
    userId: string,
    patch: Partial<Omit<NewAddress, 'id' | 'userId' | 'createdAt'>>,
  ): Promise<Address | null> {
    return this.db.transaction(async (tx) => {
      if (patch.isDefault) {
        await tx
          .update(addresses)
          .set({ isDefault: false })
          .where(
            and(eq(addresses.userId, userId), eq(addresses.isDefault, true), ne(addresses.id, id)),
          );
      }

      const [address] = await tx
        .update(addresses)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(addresses.id, id))
        .returning();

      return address ?? null;
    });
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(addresses)
      .where(eq(addresses.id, id))
      .returning({ id: addresses.id });

    return rows.length > 0;
  }

  async countForUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ id: addresses.id })
      .from(addresses)
      .where(eq(addresses.userId, userId));

    return rows.length;
  }
}
