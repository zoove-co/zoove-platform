import type { PoolClient } from 'pg';

// Serialises work for one customer inside a transaction (for example "create address" or "create booking").
// The lock is released automatically at commit or rollback.
export async function lockFor(client: PoolClient, scope: string, key: string): Promise<void> {
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`${scope}:${key}`]);
}
