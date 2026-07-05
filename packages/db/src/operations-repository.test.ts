import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleOperationsRepository } from './operations-repository';
import { canonicalOperations, commercialOrders, legalEntities, tenants } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenantWithOperations(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string, statuses: string[]) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
  const [legalEntity] = await db.insert(legalEntities).values({
    tenantId: tenant.id,
    legalName: `${slug} SL`,
    countryCode: 'ES',
  }).returning({ id: legalEntities.id });
  if (!legalEntity) throw new Error('No se pudo crear la entidad legal de prueba');

  for (const status of statuses) {
    await db.insert(canonicalOperations).values({
      tenantId: tenant.id,
      legalEntityId: legalEntity.id,
      sourceChannel: 'SHOPIFY',
      operationType: 'SALE',
      operationStatus: status,
      reviewStatus: 'PENDING',
      reconciliationStatus: 'UNMATCHED',
      verifactuStatus: 'NOT_APPLICABLE',
    });
  }
  return tenant.id;
}

describe('DrizzleOperationsRepository', () => {
  it('pagina y filtra por estado dentro de un único tenant', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenantWithOperations(db, 'tenant-a', ['DRAFT', 'DRAFT', 'READY_FOR_INVOICING']);
    const repository = new DrizzleOperationsRepository(db);

    const firstPage = await repository.list({ tenantId, page: 1, pageSize: 2 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);

    const secondPage = await repository.list({ tenantId, page: 2, pageSize: 2 });
    expect(secondPage.items).toHaveLength(1);

    const filtered = await repository.list({ tenantId, page: 1, pageSize: 10, status: 'READY_FOR_INVOICING' });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.operationStatus).toBe('READY_FOR_INVOICING');
  });

  it('nunca devuelve operaciones de otro tenant en la página del tenant A', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantAId = await seedTenantWithOperations(db, 'tenant-a', ['DRAFT']);
    const tenantBId = await seedTenantWithOperations(db, 'tenant-b', ['DRAFT', 'DRAFT']);
    const repository = new DrizzleOperationsRepository(db);

    const tenantAPage = await repository.list({ tenantId: tenantAId, page: 1, pageSize: 20 });
    expect(tenantAPage.total).toBe(1);
    expect(tenantAPage.items.every((item) => item.tenantId === tenantAId)).toBe(true);
    expect(tenantAPage.items.some((item) => item.tenantId === tenantBId)).toBe(false);
  });

  it('filtra por fecha de pedido, tipo de producto y plataforma sin usar la fecha de importación', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const [tenant] = await db.insert(tenants).values({ name: 'tenant-filters', slug: 'tenant-filters' }).returning({ id: tenants.id });
    if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
    const [legalEntity] = await db.insert(legalEntities).values({ tenantId: tenant.id, legalName: 'Filters SL', countryCode: 'ES' }).returning({ id: legalEntities.id });
    if (!legalEntity) throw new Error('No se pudo crear la entidad legal de prueba');

    await db.insert(commercialOrders).values([
      { tenantId: tenant.id, sourceChannel: 'SHOPIFY', externalOrderId: 'JULY-EBOOK', commercialDate: new Date('2026-07-10T12:00:00Z'), productNature: 'ebook' },
      { tenantId: tenant.id, sourceChannel: 'SHOPIFY', externalOrderId: 'JUNE-PRINT', commercialDate: new Date('2026-06-10T12:00:00Z'), productNature: 'general' },
    ]);
    await db.insert(canonicalOperations).values([
      { tenantId: tenant.id, legalEntityId: legalEntity.id, sourceChannel: 'SHOPIFY', sourceOrderId: 'JULY-EBOOK', operationType: 'SALE', operationStatus: 'READY', reviewStatus: 'PENDING', reconciliationStatus: 'MATCHED', verifactuStatus: 'PENDING', productNature: 'ebook' },
      { tenantId: tenant.id, legalEntityId: legalEntity.id, sourceChannel: 'SHOPIFY', sourceOrderId: 'JUNE-PRINT', operationType: 'SALE', operationStatus: 'READY', reviewStatus: 'PENDING', reconciliationStatus: 'MATCHED', verifactuStatus: 'PENDING', productNature: 'general' },
    ]);

    const page = await new DrizzleOperationsRepository(db).list({
      tenantId: tenant.id,
      page: 1,
      pageSize: 20,
      dateFrom: new Date('2026-07-01T00:00:00Z'),
      dateTo: new Date('2026-07-31T23:59:59.999Z'),
      productNature: 'ebook',
      sourceChannel: 'SHOPIFY',
    });

    expect(page.total).toBe(1);
    expect(page.items[0]?.sourceOrderId).toBe('JULY-EBOOK');
  });

  it('create() es idempotente: volver a matchear el mismo pedido actualiza la fila existente en lugar de duplicarla', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const [tenant] = await db.insert(tenants).values({ name: 'tenant-idempotent', slug: 'tenant-idempotent' }).returning({ id: tenants.id });
    if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
    const [legalEntity] = await db.insert(legalEntities).values({ tenantId: tenant.id, legalName: 'Idempotent SL', countryCode: 'ES' }).returning({ id: legalEntities.id });
    if (!legalEntity) throw new Error('No se pudo crear la entidad legal de prueba');
    const repository = new DrizzleOperationsRepository(db);

    const draft = { sourceChannel: 'SHOPIFY', sourceOrderId: 'AI-9001', operationType: 'SALE', operationStatus: 'PENDING_EVIDENCE', reconciliationStatus: 'UNMATCHED', grossAmount: 0, platformFeeAmount: 0, netAmount: 0, anomalyFlags: [] };
    const first = await repository.create(tenant.id, legalEntity.id, draft);
    const second = await repository.create(tenant.id, legalEntity.id, { ...draft, operationStatus: 'PENDING_TAX_REVIEW', reconciliationStatus: 'MATCHED', grossAmount: 6.99, platformFeeAmount: 0.35, netAmount: 6.64 });

    expect(second.id).toBe(first.id);
    expect(second.reconciliationStatus).toBe('MATCHED');
    expect(second.grossAmount).toBe('6.990000');

    const page = await repository.list({ tenantId: tenant.id, page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
  });

  it('persiste customerEmail y customerAddress al crear (pass-through de evidencia real)', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const [tenant] = await db.insert(tenants).values({ name: 'tenant-buyer', slug: 'tenant-buyer' }).returning({ id: tenants.id });
    if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
    const [legalEntity] = await db.insert(legalEntities).values({ tenantId: tenant.id, legalName: 'Buyer SL', countryCode: 'ES' }).returning({ id: legalEntities.id });
    if (!legalEntity) throw new Error('No se pudo crear la entidad legal de prueba');
    const repository = new DrizzleOperationsRepository(db);

    const created = await repository.create(tenant.id, legalEntity.id, {
      sourceChannel: 'SHOPIFY',
      sourceOrderId: 'AI-9002',
      operationType: 'SALE',
      operationStatus: 'PENDING_TAX_REVIEW',
      reconciliationStatus: 'MATCHED',
      grossAmount: 6.99,
      platformFeeAmount: 0.35,
      netAmount: 6.64,
      anomalyFlags: [],
      customerEmail: 'cliente@ejemplo.com',
      customerAddress: 'Calle Ejemplo 1, Palma',
    });

    expect(created.customerEmail).toBe('cliente@ejemplo.com');
    expect(created.customerAddress).toBe('Calle Ejemplo 1, Palma');
  });
});
