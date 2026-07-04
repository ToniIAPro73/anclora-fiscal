import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleDashboardSummaryRepository } from './dashboard-summary-repository';
import { canonicalOperations, importFiles, importJobs, issues, legalEntities, royaltyStatements, tenants } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenant(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
  return tenant.id;
}

function currentPeriodKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('DrizzleDashboardSummaryRepository', () => {
  it('devuelve un resumen de todo cero para un tenant sin datos', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-vacio');
    const repository = new DrizzleDashboardSummaryRepository(db);

    const summary = await repository.getSummary(tenantId);

    expect(summary).toEqual({
      openIssuesCount: 0,
      importsThisMonthCount: 0,
      reconciliationStatus: { matched: 0, unmatched: 0, total: 0 },
      documentsIssuedCount: 0,
      royalties: { statementsCount: 0, totalThisPeriod: '0.00' },
    });
  });

  it('agrega datos reales de issues abiertas, imports del mes y reconciliación', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-con-datos');
    const [legalEntity] = await db.insert(legalEntities).values({
      tenantId,
      legalName: 'Tenant SL',
      countryCode: 'ES',
    }).returning({ id: legalEntities.id });
    if (!legalEntity) throw new Error('legal entity missing');

    await db.insert(issues).values([
      { tenantId, code: 'ISSUE_1', severity: 'HIGH', status: 'OPEN', title: 'Issue 1', explanation: 'x' },
      { tenantId, code: 'ISSUE_2', severity: 'LOW', status: 'RESOLVED', title: 'Issue 2', explanation: 'x' },
    ]);

    await db.insert(importJobs).values({ tenantId, status: 'PREVIEW_READY', connectorId: 'shopify-orders-csv' });

    await db.insert(canonicalOperations).values([
      { tenantId, legalEntityId: legalEntity.id, sourceChannel: 'SHOPIFY', sourceOrderId: '1', operationType: 'SALE', operationStatus: 'READY_FOR_INVOICING', reviewStatus: 'PENDING', reconciliationStatus: 'MATCHED', verifactuStatus: 'PENDING' },
      { tenantId, legalEntityId: legalEntity.id, sourceChannel: 'SHOPIFY', sourceOrderId: '2', operationType: 'SALE', operationStatus: 'DRAFT', reviewStatus: 'PENDING', reconciliationStatus: 'UNMATCHED', verifactuStatus: 'PENDING' },
    ]);

    const [importFile] = await db.insert(importFiles).values({
      tenantId,
      importJobId: (await db.insert(importJobs).values({ tenantId, status: 'PREVIEW_READY', connectorId: 'kdp-xlsx' }).returning({ id: importJobs.id }))[0]!.id,
      storageKey: `${tenantId}/kdp`,
      originalNameEncrypted: 'v1:ciphertext',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      byteSize: '128',
      sha256: 'a'.repeat(64),
      importerVersion: 'kdp-xlsx@0.1.0',
    }).returning({ id: importFiles.id });
    if (!importFile) throw new Error('import file missing');

    const period = currentPeriodKey();
    await db.insert(royaltyStatements).values({
      tenantId,
      importFileId: importFile.id,
      sourceConnector: 'kdp',
      currency: 'EUR',
      periods: [period],
      totalRoyalties: '42.50',
      lineCount: '3',
      hash: 'b'.repeat(64),
    });

    const repository = new DrizzleDashboardSummaryRepository(db);
    const summary = await repository.getSummary(tenantId);

    expect(summary.openIssuesCount).toBe(1);
    expect(summary.importsThisMonthCount).toBe(2);
    expect(summary.reconciliationStatus).toEqual({ matched: 1, unmatched: 1, total: 2 });
    expect(summary.documentsIssuedCount).toBe(0);
    expect(summary.royalties).toEqual({ statementsCount: 1, totalThisPeriod: '42.50' });
  });

  it('nunca mezcla datos de otro tenant en el resumen', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantAId = await seedTenant(db, 'tenant-a');
    const tenantBId = await seedTenant(db, 'tenant-b');

    await db.insert(issues).values({ tenantId: tenantBId, code: 'ISSUE_B', severity: 'HIGH', status: 'OPEN', title: 'Issue B', explanation: 'x' });
    await db.insert(importJobs).values({ tenantId: tenantBId, status: 'PREVIEW_READY', connectorId: 'shopify-orders-csv' });

    const repository = new DrizzleDashboardSummaryRepository(db);
    const summary = await repository.getSummary(tenantAId);

    expect(summary.openIssuesCount).toBe(0);
    expect(summary.importsThisMonthCount).toBe(0);
  });
});
