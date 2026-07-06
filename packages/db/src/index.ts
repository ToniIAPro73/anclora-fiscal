import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import * as schema from './schema.js';

export function createRemoteDatabase(url: string) {
  const client = postgres(url, { max: 10, prepare: false });
  return { db: drizzlePostgres(client, { schema }), close: () => client.end() };
}

export function createOfflineDatabase(path = 'memory://') {
  const client = new PGlite(path);
  return { db: drizzlePglite(client, { schema }), client };
}

export * from './schema.js';
export * from './migrations.js';
export * from './import-preview-repository.js';
export * from './import-issue-codes.js';
export * from './auth-audit-repository.js';
export * from './operations-repository.js';
export * from './financial-events-repository.js';
export * from './reconciliation-repository.js';
export * from './issues-repository.js';
export * from './fiscal-documents-repository.js';
export * from './shopify-sales-repository.js';
export * from './period-closes-repository.js';
export * from './vat-dossiers-repository.js';
export * from './royalty-repository.js';
export * from './commercial-orders-repository.js';
export * from './legal-entities-repository.js';
export * from './dashboard-summary-repository.js';
export * from './tax-decisions-repository.js';
export * from './fiscal-configuration-repository.js';
export * from './shopify-order-payment-events-repository.js';
export * from './shopify-payments-ledger-repository.js';
export * from './shopify-evidence-links-repository.js';
