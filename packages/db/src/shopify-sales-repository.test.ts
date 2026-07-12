import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleShopifySalesRepository } from './shopify-sales-repository';
import {
  canonicalOperations,
  commercialOrders,
  fiscalDocuments,
  legalEntities,
  tenants,
} from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedOrder(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  slug: string,
  overrides?: { fiscalDocument?: boolean; reconciliationStatus?: string; verifactuStatus?: string },
) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');

  const [legalEntity] = await db.insert(legalEntities).values({
    tenantId: tenant.id,
    legalName: `${slug} legal entity`,
    countryCode: 'ES',
  }).returning({ id: legalEntities.id });
  if (!legalEntity) throw new Error('No se pudo crear la entidad legal de prueba');

  const [order] = await db.insert(commercialOrders).values({
    tenantId: tenant.id,
    sourceChannel: 'SHOPIFY',
    externalOrderId: 'ORDER-1',
    commercialDate: new Date('2026-07-05T10:00:00.000Z'),
    customerCountry: 'ES',
    totalAmount: '6.99',
    taxAmount: '0.27',
    paymentStatus: 'PAID',
    refundStatus: 'NONE',
    fiscalStatus: 'INVOICED',
  }).returning({ id: commercialOrders.id });
  if (!order) throw new Error('No se pudo crear el pedido comercial de prueba');

  const [operation] = await db.insert(canonicalOperations).values({
    tenantId: tenant.id,
    legalEntityId: legalEntity.id,
    sourceChannel: 'SHOPIFY',
    sourceOrderId: 'ORDER-1',
    operationType: 'SALE',
    operationStatus: 'INVOICED',
    reviewStatus: 'REVIEWED',
    reconciliationStatus: overrides?.reconciliationStatus ?? 'MATCHED',
    verifactuStatus: overrides?.verifactuStatus ?? 'PENDING',
  }).returning({ id: canonicalOperations.id });
  if (!operation) throw new Error('No se pudo crear la operación canónica de prueba');

  if (overrides?.fiscalDocument !== false) {
    await db.insert(fiscalDocuments).values({
      tenantId: tenant.id,
      canonicalOperationId: operation.id,
      number: 'FS-00001',
      documentType: 'SIMPLIFICADA',
      status: 'ISSUED',
      issuedAt: new Date('2026-07-05T10:05:00.000Z'),
      taxBase: '6.72',
      taxAmount: '0.27',
      totalAmount: '6.99',
      currency: 'EUR',
      renderStorageKey: `tests/${slug}.pdf`,
      renderSha256: `sha-${slug}`,
    });
  }

  return { tenantId: tenant.id };
}

describe('DrizzleShopifySalesRepository.exportAdvisory', () => {
  it('exporta el pedido con estado fiscal, factura, conciliación y VERI*FACTU', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleShopifySalesRepository(db);
    const { tenantId } = await seedOrder(db, 'tenant-export-full');

    const rows = await repository.exportAdvisory({ tenantId });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalOrderId: 'ORDER-1',
      customerCountry: 'ES',
      channel: 'Shopify',
      totalAmount: 6.99,
      taxAmount: 0.27,
      fiscalStatus: 'INVOICED',
      documentType: 'SIMPLIFICADA',
      documentNumber: 'FS-00001',
      reconciliationStatus: 'MATCHED',
      verifactuStatus: 'PENDING',
    });
    expect(rows[0]!.taxBase).toBeCloseTo(6.72, 2);
    expect(rows[0]!.taxRate).toBeCloseTo(0.27 / 6.72, 4);
  });

  it('deja el número/tipo de documento en null cuando aún no se ha emitido factura', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleShopifySalesRepository(db);
    const { tenantId } = await seedOrder(db, 'tenant-export-no-invoice', { fiscalDocument: false });

    const rows = await repository.exportAdvisory({ tenantId });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.documentType).toBeNull();
    expect(rows[0]?.documentNumber).toBeNull();
  });

  it('respeta los filtros de fecha, igual que list()', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleShopifySalesRepository(db);
    const { tenantId } = await seedOrder(db, 'tenant-export-date-filter');

    const outsideRange = await repository.exportAdvisory({
      tenantId,
      dateFrom: new Date('2026-08-01T00:00:00.000Z'),
    });
    const insideRange = await repository.exportAdvisory({
      tenantId,
      dateFrom: new Date('2026-07-01T00:00:00.000Z'),
      dateTo: new Date('2026-07-31T23:59:59.000Z'),
    });

    expect(outsideRange).toHaveLength(0);
    expect(insideRange).toHaveLength(1);
  });

  it('no exporta pedidos de otro tenant', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleShopifySalesRepository(db);
    await seedOrder(db, 'tenant-export-isolation-a');
    const { tenantId: otherTenantId } = await seedOrder(db, 'tenant-export-isolation-b');

    const rows = await repository.exportAdvisory({ tenantId: otherTenantId });

    expect(rows).toHaveLength(1);
    expect(rows.every((row) => row.externalOrderId === 'ORDER-1')).toBe(true);
  });
});

describe('DrizzleShopifySalesRepository.list — payoutStatus por pedido', () => {
  it('escopea payoutStatus/ledgerCount al pedido correcto y no los mezcla con otros pedidos del mismo tenant', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const { importFiles, importJobs, shopifyPaymentsLedgerEntries } = await import('./schema');

    const [tenant] = await db.insert(tenants).values({ name: 'tenant-payout-scope', slug: 'tenant-payout-scope' }).returning({ id: tenants.id });
    if (!tenant) throw new Error('no tenant');

    const [orderWithPayout] = await db.insert(commercialOrders).values({
      tenantId: tenant.id, sourceChannel: 'SHOPIFY', externalOrderId: 'ORDER-A',
      commercialDate: new Date('2026-07-05T10:00:00.000Z'), totalAmount: '10.00', taxAmount: '0.40',
    }).returning({ id: commercialOrders.id });
    const [orderWithoutPayout] = await db.insert(commercialOrders).values({
      tenantId: tenant.id, sourceChannel: 'SHOPIFY', externalOrderId: 'ORDER-B',
      commercialDate: new Date('2026-07-06T10:00:00.000Z'), totalAmount: '20.00', taxAmount: '0.80',
    }).returning({ id: commercialOrders.id });
    if (!orderWithPayout || !orderWithoutPayout) throw new Error('no orders');

    const [importJob] = await db.insert(importJobs).values({ tenantId: tenant.id, connectorId: 'shopify-payments-ledger-test' }).returning({ id: importJobs.id });
    const [importFile] = await db.insert(importFiles).values({
      tenantId: tenant.id,
      importJobId: importJob!.id,
      storageKey: 'tests/tenant-payout-scope/ledger.csv',
      originalNameEncrypted: 'ledger.csv',
      mimeType: 'text/csv',
      byteSize: '1',
      sha256: 'test-sha256-tenant-payout-scope',
      importerVersion: 'test',
    }).returning({ id: importFiles.id });

    await db.insert(shopifyPaymentsLedgerEntries).values({
      tenantId: tenant.id,
      importFileId: importFile!.id,
      externalEntryKey: 'tenant-payout-scope:entry-a',
      commercialOrderId: orderWithPayout.id,
      shopifyOrderName: 'ORDER-A',
      entryType: 'charge',
      amount: '10.00',
      feeAmount: '0.30',
      netAmount: '9.70',
      currency: 'EUR',
      payoutStatus: 'PAID',
      externalPayoutId: 'payout-1',
    });

    const repository = new DrizzleShopifySalesRepository(db);
    const result = await repository.list({ tenantId: tenant.id, page: 1, pageSize: 20 });

    const orderA = result.items.find((item) => (item as { externalOrderId: string }).externalOrderId === 'ORDER-A') as { payoutStatus: string | null; ledgerCount: number } | undefined;
    const orderB = result.items.find((item) => (item as { externalOrderId: string }).externalOrderId === 'ORDER-B') as { payoutStatus: string | null; ledgerCount: number } | undefined;

    expect(orderA?.payoutStatus).toBe('SETTLED');
    expect(orderA?.ledgerCount).toBe(1);
    expect(orderB?.payoutStatus).toBe('LEDGER_MISSING');
    expect(orderB?.ledgerCount).toBe(0);
  });
});
