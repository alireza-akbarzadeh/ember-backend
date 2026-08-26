import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import {
  type NewRefreshToken,
  type RefreshToken,
  refreshTokens,
} from '../../database/schema/refresh-tokens';

@Injectable()
export class RefreshTokenRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async insert(values: NewRefreshToken): Promise<RefreshToken> {
    const [row] = await this.db.insert(refreshTokens).values(values).returning();
    return row;
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    return row ?? null;
  }

  /**
   * Revokes a token only if it is still active, reporting whether this call is
   * the one that did it.
   *
   * The `revoked_at IS NULL` predicate makes rotation atomic: two requests
   * racing with the same token produce exactly one winner, and the loser is
   * correctly treated as a replay.
   */
  async markRevoked(id: string): Promise<boolean> {
    const rows = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });

    return rows.length > 0;
  }

  /** Kills an entire rotation lineage — the response to a detected replay. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  /** Signs the user out of every device. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  /** Housekeeping for expired rows; safe to run from a scheduled job. */
  async deleteExpired(before: Date): Promise<void> {
    await this.db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, before));
  }
}
