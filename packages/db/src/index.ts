import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import * as schema from './schema';

export function createRemoteDatabase(url: string) {
  const client = postgres(url, { max: 10, prepare: false });
  return { db: drizzlePostgres(client, { schema }), close: () => client.end() };
}

export function createOfflineDatabase(path = 'memory://') {
  const client = new PGlite(path);
  return { db: drizzlePglite(client, { schema }), client };
}

export * from './schema';
export * from './migrations';
export * from './import-preview-repository';
