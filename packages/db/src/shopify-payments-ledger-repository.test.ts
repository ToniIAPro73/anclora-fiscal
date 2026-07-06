import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleShopifyPaymentsLedgerRepository } from './shopify-payments-ledger-repository';
import { DrizzleCommercialOrdersRepository } from './commercial-orders-repository';
import { importFiles, importJobs, payouts, tenants } from './schema';

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
  const [job] = await db.insert(importJobs).values({ tenantId, status: 'PREVIEW_READY', connectorId: 'shopify-payments' }).returning({ id: importJobs.id });
  if (!job) throw new Error('job missing');
  const [file] = await db.insert(importFiles).values({
    tenantId,
    importJobId: job.id,
    storageKey: `${tenantId}/ledger-${suffix}`,
    originalNameEncrypted: 'v1:ciphertext',
    mimeType: 'text/csv',
    byteSize: '128',
    sha256: `${suffix.padEnd(64, '1')}`.slice(0, 64),
    importerVersion: 'shopify-payments-ledger-csv@0.1.0',
  }).returning({ id: importFiles.id });
  if (!file) throw new Error('file missing');
  return file.id;
}

async function seedCommercialOrder(db: ReturnType<typeof createOfflineDatabase>['db'], tenantId: string, externalOrderId: string) {
  const repository = new DrizzleCommercialOrdersRepository(db);
  const order = await repository.create(tenantId, { sourceChannel: 'SHOPIFY', externalOrderId });
  return order.id;
}

const baseRow = (overrides: Partial<Parameters<DrizzleShopifyPaymentsLedgerRepository<never>['createMany']>[2][number]> = {}) => ({
  externalEntryKey: 'entry-1',
  commercialOrderId: null,
  shopifyOrderName: 'AI-1001',
  checkoutReference: '#68683485610367',
  entryType: 'charge',
  amount: '6.99',
  feeAmount: '0.45',
  netAmount: '6.54',
  currency: 'EUR',
  payoutStatus: 'pending',
  minimizedSnapshot: {},
  ...overrides,
});

describe('DrizzleShopifyPaymentsLedgerRepository', () => {
  it('shopify_order_name resuelve correctamente al pedido comercial', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f1');
    const commercialOrderId = await seedCommercialOrder(db, tenantId, 'AI-1001');
    const repository = new DrizzleShopifyPaymentsLedgerRepository(db);

    await repository.createMany(tenantId, importFileId, [baseRow({ commercialOrderId })]);

    const [found] = await repository.findByTenantAndOrder(tenantId, 'AI-1001');
    expect(found?.commercialOrderId).toBe(commercialOrderId);
  });

  it('el fee_amount se conserva exactamente tras la persistencia', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f2');
    const repository = new DrizzleShopifyPaymentsLedgerRepository(db);

    await repository.createMany(tenantId, importFileId, [baseRow({ feeAmount: '0.45' })]);

    const [found] = await repository.findByTenantAndOrder(tenantId, 'AI-1001');
    expect(found?.feeAmount).toBe('0.450000');
  });

  it('payout pendiente: sin external_payout_id no crea fila en payouts y aparece en el modelo de lectura pendiente', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f3');
    const repository = new DrizzleShopifyPaymentsLedgerRepository(db);

    await repository.createMany(tenantId, importFileId, [baseRow({ externalPayoutId: undefined })]);

    const payoutRows = await db.select().from(payouts);
    expect(payoutRows.filter((row) => row.tenantId === tenantId)).toHaveLength(0);

    const pending = await repository.findPendingSettlement(tenantId);
    expect(pending).toHaveLength(1);
  });

  it('payout liquidado: con external_payout_id crea una fila real en payouts y la vincula', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f4');
    const repository = new DrizzleShopifyPaymentsLedgerRepository(db);

    await repository.createMany(tenantId, importFileId, [baseRow({ externalPayoutId: 'payout-1' })]);

    const payoutRows = await db.select().from(payouts);
    const created = payoutRows.find((row) => row.tenantId === tenantId && row.externalPayoutId === 'payout-1');
    expect(created).toBeDefined();
    expect(created?.channel).toBe('SHOPIFY');

    const pending = await repository.findPendingSettlement(tenantId);
    expect(pending).toHaveLength(0);
  });

  it('tolerancia bruto/fee/neto: adjunta GROSS_FEE_NET_MISMATCH sin rechazar la escritura', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f5');
    const repository = new DrizzleShopifyPaymentsLedgerRepository(db);

    const result = await repository.createMany(tenantId, importFileId, [baseRow({ amount: '10.00', feeAmount: '0.45', netAmount: '6.54' })]);

    expect(result.entries).toHaveLength(1);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'GROSS_FEE_NET_MISMATCH', externalEntryKey: 'entry-1' })]);
  });

  it('es idempotente: reimportar el mismo archivo dos veces no duplica filas de ledger ni de payouts', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f6');
    const repository = new DrizzleShopifyPaymentsLedgerRepository(db);

    await repository.createMany(tenantId, importFileId, [baseRow({ externalPayoutId: 'payout-2' })]);
    await repository.createMany(tenantId, importFileId, [baseRow({ externalPayoutId: 'payout-2' })]);

    const rows = await repository.findPaginated(tenantId, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);

    const payoutRows = await db.select().from(payouts);
    expect(payoutRows.filter((row) => row.tenantId === tenantId && row.externalPayoutId === 'payout-2')).toHaveLength(1);
  });

  it('aísla por tenant: findByTenantAndOrder/findPaginated nunca filtran datos de otro tenant con el mismo shopify_order_name', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantA = await seedTenant(db, 'tenant-a');
    const tenantB = await seedTenant(db, 'tenant-b');
    const fileA = await seedImportFile(db, tenantA, 'fa');
    const fileB = await seedImportFile(db, tenantB, 'fb');
    const repository = new DrizzleShopifyPaymentsLedgerRepository(db);

    await repository.createMany(tenantA, fileA, [baseRow({ externalEntryKey: 'a-entry' })]);
    await repository.createMany(tenantB, fileB, [baseRow({ externalEntryKey: 'b-entry' })]);

    const rowsA = await repository.findByTenantAndOrder(tenantA, 'AI-1001');
    const rowsB = await repository.findByTenantAndOrder(tenantB, 'AI-1001');
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]?.externalEntryKey).toBe('a-entry');
    expect(rowsB[0]?.externalEntryKey).toBe('b-entry');
  });

  it('no contiene PII (nombre de titular de tarjeta) en minimized_snapshot', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const importFileId = await seedImportFile(db, tenantId, 'f7');
    const repository = new DrizzleShopifyPaymentsLedgerRepository(db);

    await repository.createMany(tenantId, importFileId, [baseRow({ minimizedSnapshot: { entryType: 'charge', amount: '6.99', cardBrand: 'master' } })]);

    const [found] = await repository.findByTenantAndOrder(tenantId, 'AI-1001');
    expect(JSON.stringify(found?.minimizedSnapshot)).not.toMatch(/holder|cardHolderName|nombre/i);
  });
});
