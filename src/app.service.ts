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

@Injectable()
export class AppService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Liveness: the process is running. Must not touch dependencies. */
  health(): HealthStatus {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
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
