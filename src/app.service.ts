import { Inject, Injectable } from '@nestjs/common';
import { getTableColumns, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { DRIZZLE, type Database } from './database/database.constants';
import * as schema from './database/schema';

export interface HealthStatus {
  status: 'ok';
  uptime: number;
}

export interface ReadinessStatus {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
}

export interface Diagnostics {
  database: 'up' | 'down';
  /**
   * `missing` — no tables at all, nothing has been migrated.
   * `outdated` — some exist but the schema is behind the code.
   * `unknown` — could not be determined, because the database is unreachable.
   */
  schema: 'ready' | 'outdated' | 'missing' | 'unknown';
  /** Absent tables and `table.column` pairs, capped for display. */
  missing: string[];
}

@Injectable()
export class AppService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Liveness: the process is running. Must not touch dependencies. */
  health(): HealthStatus {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  /**
   * Connectivity, plus whether the live schema actually matches the code.
   *
   * Every table and column Drizzle declares is compared against
   * `information_schema`. Checking one well-known table is not enough: a
   * database migrated to 0002 has `users` and looks fine, then fails every
   * write to a column 0003 was supposed to add. That is the confusing state
   * this exists to name — `select 1` succeeds throughout it.
   */
  async diagnostics(): Promise<Diagnostics> {
    try {
      const result = await this.db.execute<{
        table_name: string;
        column_name: string;
      }>(
        sql`select table_name, column_name from information_schema.columns
            where table_schema = 'public'`,
      );

      const live = new Map<string, Set<string>>();
      for (const row of result.rows) {
        const columns = live.get(row.table_name) ?? new Set<string>();
        columns.add(row.column_name);
        live.set(row.table_name, columns);
      }

      const missing: string[] = [];
      let tablesFound = 0;

      for (const [table, columns] of declaredSchema()) {
        const liveColumns = live.get(table);

        if (!liveColumns) {
          missing.push(table);
          continue;
        }

        tablesFound += 1;
        for (const column of columns) {
          if (!liveColumns.has(column)) missing.push(`${table}.${column}`);
        }
      }

      if (missing.length === 0) {
        return { database: 'up', schema: 'ready', missing: [] };
      }

      return {
        database: 'up',
        schema: tablesFound === 0 ? 'missing' : 'outdated',
        // Enough to identify the problem without rendering a wall of text.
        missing: missing.slice(0, 12),
      };
    } catch {
      return { database: 'down', schema: 'unknown', missing: [] };
    }
  }

  /**
   * Readiness: the process can actually serve traffic. A failed database ping
   * is reported, never thrown — the caller decides what to do with `degraded`.
   */
  async readiness(): Promise<ReadinessStatus> {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ok', database: 'up' };
    } catch {
      return { status: 'degraded', database: 'down' };
    }
  }
}

/**
 * Every table and its column names, read from the Drizzle schema itself.
 *
 * Derived rather than hand-listed, so adding a table to the barrel is enough —
 * a hardcoded list would go stale exactly when it mattered.
 */
export function declaredSchema(): Map<string, Set<string>> {
  const declared = new Map<string, Set<string>>();

  for (const exported of Object.values(schema)) {
    if (!is(exported, PgTable)) continue;

    // getTableColumns' return type depends on the table's generic, which is
    // erased by the PgTable narrowing above. Every Drizzle column carries a
    // `name`, so this asserts only what the library already guarantees.
    const columns = getTableColumns(exported) as Record<string, { name: string }>;

    declared.set(
      getTableName(exported),
      new Set(Object.values(columns).map((column) => column.name)),
    );
  }

  return declared;
}
