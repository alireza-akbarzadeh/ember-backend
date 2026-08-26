import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.constants';
import {
  type NewRestaurant,
  type Restaurant,
  restaurants,
} from '../../database/schema/restaurants';
import { boundingBox, distanceKmSql, likePattern, rankingScoreSql, type Coordinates } from './geo';
import type { RestaurantSort } from './dto/list-restaurants.query.dto';

export interface SearchRestaurantsOptions {
  search?: string;
  city?: string;
  cuisine?: string[];
  priceLevel?: number[];
  minRating?: number;
  maxDeliveryFeeCents?: number;
  openNow?: boolean;
  ownerId?: string;
  origin?: Coordinates;
  radiusKm?: number;
  sort?: RestaurantSort;
  limit: number;
  offset: number;
}

/** A restaurant row plus how far it is from the caller, when that is known. */
export interface RestaurantWithDistance extends Restaurant {
  distanceKm: number | null;
}

export interface SearchResult {
  rows: RestaurantWithDistance[];
  total: number;
}

@Injectable()
export class RestaurantsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: string): Promise<Restaurant | null> {
    const [restaurant] = await this.db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, id))
      .limit(1);

    return restaurant ?? null;
  }

  /**
   * The browse query: filter, rank, paginate.
   *
   * Runs the page and the count together — the client needs `total` to render
   * pagination, and issuing them sequentially doubles the latency for no
   * reason, since neither depends on the other.
   */
  async search(options: SearchRestaurantsOptions): Promise<SearchResult> {
    const where = this.buildFilters(options);
    const distance = options.origin ? distanceKmSql(options.origin) : sql<number | null>`null`;

    const [rows, [totals]] = await Promise.all([
      this.db
        .select({ ...getTableColumns(restaurants), distanceKm: distance })
        .from(restaurants)
        .where(where)
        .orderBy(...this.buildOrder(options))
        .limit(options.limit)
        .offset(options.offset),
      this.db.select({ value: count() }).from(restaurants).where(where),
    ]);

    return { rows, total: totals?.value ?? 0 };
  }

  private buildFilters(options: SearchRestaurantsOptions): SQL | undefined {
    const filters: SQL[] = [];

    if (options.city) filters.push(eq(restaurants.city, options.city));
    if (options.ownerId) filters.push(eq(restaurants.ownerId, options.ownerId));
    if (options.openNow) filters.push(eq(restaurants.isOpen, true));

    if (options.minRating !== undefined) {
      filters.push(gte(restaurants.ratingAverage, options.minRating));
    }

    if (options.maxDeliveryFeeCents !== undefined) {
      filters.push(lte(restaurants.deliveryFeeCents, options.maxDeliveryFeeCents));
    }

    if (options.priceLevel?.length) {
      filters.push(inArray(restaurants.priceLevel, options.priceLevel));
    }

    if (options.cuisine?.length) {
      // `&&` is array overlap: true when the restaurant has *any* of the tags,
      // which is what a multi-select filter means. Uses the GIN index.
      const tags = sql.join(
        options.cuisine.map((tag) => sql`${tag}`),
        sql`, `,
      );
      filters.push(sql`${restaurants.cuisines} && ARRAY[${tags}]::text[]`);
    }

    if (options.search) {
      const pattern = likePattern(options.search);

      // ILIKE with a leading wildcard cannot use a btree index, so this scans.
      // Correct and fast enough for a city's worth of restaurants; swap in
      // pg_trgm + GIN before it becomes a problem.
      const matches = or(
        ilike(restaurants.name, pattern),
        ilike(restaurants.description, pattern),
        sql`array_to_string(${restaurants.cuisines}, ' ') ilike ${pattern}`,
      );
      if (matches) filters.push(matches);
    }

    if (options.origin && options.radiusKm) {
      const box = boundingBox(options.origin, options.radiusKm);

      // Cheap index-friendly prefilter first, exact great-circle distance
      // second. Doing only the latter would seq-scan the table.
      filters.push(
        isNotNull(restaurants.latitude),
        isNotNull(restaurants.longitude),
        gte(restaurants.latitude, box.minLat),
        lte(restaurants.latitude, box.maxLat),
        gte(restaurants.longitude, box.minLng),
        lte(restaurants.longitude, box.maxLng),
        sql`${distanceKmSql(options.origin)} <= ${options.radiusKm}`,
      );
    }

    return filters.length > 0 ? and(...filters) : undefined;
  }

  private buildOrder(options: SearchRestaurantsOptions): SQL[] {
    // Without a location, distance is meaningless — fall back to quality.
    const sort = options.sort ?? (options.origin ? 'distance' : 'rating');

    switch (sort) {
      case 'distance':
        return options.origin
          ? [distanceKmSql(options.origin), desc(rankingScoreSql())]
          : [desc(rankingScoreSql())];
      case 'deliveryFee':
        return [asc(restaurants.deliveryFeeCents), desc(rankingScoreSql())];
      case 'prepTime':
        return [asc(restaurants.preparationMinutes), desc(rankingScoreSql())];
      case 'popularity':
        return [desc(restaurants.ratingCount), desc(rankingScoreSql())];
      case 'rating':
      default:
        // Smoothed, not raw: see rankingScoreSql. Ties break on how much
        // evidence there is, then on id so pages never repeat a row.
        return [desc(rankingScoreSql()), desc(restaurants.ratingCount), asc(restaurants.id)];
    }
  }

  /** Ids only — used to scope an owner's order list without loading rows. */
  async findIdsByOwner(ownerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.ownerId, ownerId));

    return rows.map((row) => row.id);
  }

  async insert(values: NewRestaurant): Promise<Restaurant> {
    const [restaurant] = await this.db.insert(restaurants).values(values).returning();

    return restaurant;
  }

  async update(
    id: string,
    patch: Partial<Omit<NewRestaurant, 'id' | 'ownerId' | 'createdAt'>>,
  ): Promise<Restaurant | null> {
    const [restaurant] = await this.db
      .update(restaurants)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(restaurants.id, id))
      .returning();

    return restaurant ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(restaurants)
      .where(eq(restaurants.id, id))
      .returning({ id: restaurants.id });

    return rows.length > 0;
  }
}
