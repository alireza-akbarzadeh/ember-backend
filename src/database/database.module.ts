import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DRIZZLE, PG_POOL } from './database.constants';
import * as schema from './schema';

/**
 * Owns the single connection pool for the process.
 *
 * Global so feature modules can inject `DRIZZLE` without importing this module
 * — there is exactly one pool and nothing to configure per module.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          max: config.get<number>('DATABASE_POOL_MAX', 10),
          // Neon closes idle connections server-side; recycle before it does.
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
        }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE, PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Drains the pool on SIGTERM so a redeploy doesn't sever live queries. */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
