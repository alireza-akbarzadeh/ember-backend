import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from './database/database.constants';

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
  /** Whether migrations have actually been applied. */
  schema: 'ready' | 'missing' | 'unknown';
}

@Injectable()
export class AppService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Liveness: the process is running. Must not touch dependencies. */
  health(): HealthStatus {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  /**
   * Connectivity *and* whether the tables exist.
   *
   * "Connected but unmigrated" is the state that produces confusing 500s on
   * every route while `select 1` still succeeds, so the home page reports it
   * explicitly instead of letting it look like a code bug.
   */
  async diagnostics(): Promise<Diagnostics> {
    try {
      const result = await this.db.execute<{ present: string | null }>(
        sql`select to_regclass('public.users')::text as present`,
      );

      const present = result.rows[0]?.present != null;
      return { database: 'up', schema: present ? 'ready' : 'missing' };
    } catch {
      return { database: 'down', schema: 'unknown' };
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
