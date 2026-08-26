import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');

/** The injected client type. Carries the schema so `db.query` is typed. */
export type Database = NodePgDatabase<typeof schema>;
