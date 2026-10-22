import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

import { APP_CONFIG, type Env } from '../config/env';

// The only door to Postgres. Business code never builds its own connections.
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger('Database');
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) config: Env) {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      // Supabase needs TLS. TODO before launch: verify the server certificate instead of skipping the check.
      ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    // An idle client can fail (database restart). Log it; the pool replaces the connection.
    this.pool.on('error', (error) => this.logger.error(`Idle client error: ${error.message}`));
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  // Runs fn inside one transaction: commits when it returns, rolls back when it throws.
  // Work that must survive a failure (for example counting a wrong OTP) has to return its result
  // and let the caller throw after the commit.
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
