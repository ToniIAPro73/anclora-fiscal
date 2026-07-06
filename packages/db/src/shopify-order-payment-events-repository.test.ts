import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleShopifyOrderPaymentEventsRepository } from './shopify-order-payment-events-repository';
import { DrizzleCommercialOrdersRepository } from './commercial-orders-repository';
import { importFiles, importJobs, tenants } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenant(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
  return tenant.id;
}

async function seedImportFile(db: ReturnType<typeof createOfflineDatabase>['db'], tenantId: string, suffix: string) {
  const [job] = await db.insert(importJobs).values({ tenantId, status: 'PREVIEW_READY', connectorId: 'shopify-order-transactions' }).returning({ id: importJobs.id });
  if (!job) throw new Error('job missing');
  const [file] = await db.insert(importFiles).values({
    tenantId,
    importJobId: job.id,
    storageKey: `${tenantId}/order-transactions-${suffix}`,
    originalNameEncrypted: 'v1:ciphertext',
    mimeType: 'text/csv',
    byteSize: '128',
    sha256: `${suffix.padEnd(64, '0')}`.slice(0, 64),
    importerVersion: 'shopify-order-transactions-csv@0.1.0',
  }).returning({ id: importFiles.id });
  if (!file) throw new Error('file missing');
  return file.id;
}

async function seedCommercialOrder(db: ReturnType<typeof createOfflineDatabase>['db'], tenantId: string, externalOrderId: string) {
  const repository = new DrizzleCommercialOrdersRepository(db);
  const order = await repository.create(tenantId, { sourceChannel: 'SHOPIFY', externalOrderId });
  return order.id;
}

const baseRow = (overrides: Partial<Parameters<DrizzleShopifyOrderPaymentEventsRepository<never>['createMany']>[2][number]> = {}) => ({
  externalEventKey: 'key-1',
  commercialOrderId: null,
  shopifyOrderId: '9000000000001',
  shopifyOrderName: 'AI-1001',
  kind: 'sale',
  gateway: 'shopify_payments',
  status: 'success',
  amount: '6.99',
  currency: 'EUR',
  occurredAt: new Date('2026-07-01T07:33:07Z'),
  minimizedSnapshot: {},
  ...overrides,
});

describe('DrizzleShopifyOrderPaymentEventsRepository', () => {
  it('shopify_order_name (no el shopify_order_id numérico) resuelve al commercial_order_id correcto', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f1');
    const commercialOrderId = await seedCommercialOrder(db, tenantId, 'AI-1001');
    const repository = new DrizzleShopifyOrderPaymentEventsRepository(db);

    await repository.createMany(tenantId, importFileId, [baseRow({ commercialOrderId })]);

    const [found] = await repository.findByTenantAndOrder(tenantId, 'AI-1001');
    expect(found?.commercialOrderId).toBe(commercialOrderId);
    // shopifyOrderId is stored verbatim but carries no FK meaning.
    expect(found?.shopifyOrderId).toBe('9000000000001');
  });

  it('persiste refunds en dos fechas distintas como eventos distintos, sin deduplicar', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f2');
    const repository = new DrizzleShopifyOrderPaymentEventsRepository(db);

    await repository.createMany(tenantId, importFileId, [
      baseRow({ externalEventKey: 'refund-1', kind: 'refund', occurredAt: new Date('2026-07-01T00:00:00Z') }),
      baseRow({ externalEventKey: 'refund-2', kind: 'refund', occurredAt: new Date('2026-07-05T00:00:00Z') }),
    ]);

    const rows = await repository.findByTenantAndOrder(tenantId, 'AI-1001');
    expect(rows).toHaveLength(2);
  });

  it('es idempotente: reimportar el mismo archivo dos veces no duplica filas', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f3');
    const repository = new DrizzleShopifyOrderPaymentEventsRepository(db);

    await repository.createMany(tenantId, importFileId, [baseRow()]);
    await repository.createMany(tenantId, importFileId, [baseRow()]);

    const rows = await repository.findPaginated(tenantId, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
  });

  it('no contiene PII (nombre de titular de tarjeta) en minimized_snapshot', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f4');
    const repository = new DrizzleShopifyOrderPaymentEventsRepository(db);

    await repository.createMany(tenantId, importFileId, [baseRow({ minimizedSnapshot: { kind: 'sale', gateway: 'shopify_payments', amount: '6.99' } })]);

    const [found] = await repository.findByTenantAndOrder(tenantId, 'AI-1001');
    expect(JSON.stringify(found?.minimizedSnapshot)).not.toMatch(/holder|cardHolderName|nombre/i);
  });

  it('aísla por tenant: findByTenantAndOrder/findPaginated nunca filtran datos de otro tenant con el mismo shopify_order_name', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantA = await seedTenant(db, 'tenant-a');
    const tenantB = await seedTenant(db, 'tenant-b');
    const fileA = await seedImportFile(db, tenantA, 'fa');
    const fileB = await seedImportFile(db, tenantB, 'fb');
    const repository = new DrizzleShopifyOrderPaymentEventsRepository(db);

    await repository.createMany(tenantA, fileA, [baseRow({ externalEventKey: 'a-key' })]);
    await repository.createMany(tenantB, fileB, [baseRow({ externalEventKey: 'b-key' })]);

    const rowsA = await repository.findByTenantAndOrder(tenantA, 'AI-1001');
    const rowsB = await repository.findByTenantAndOrder(tenantB, 'AI-1001');
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]?.externalEventKey).toBe('a-key');
    expect(rowsB[0]?.externalEventKey).toBe('b-key');

    const paginatedA = await repository.findPaginated(tenantA, { limit: 10, offset: 0 });
    expect(paginatedA.every((row) => row.tenantId === tenantA)).toBe(true);
  });
});
