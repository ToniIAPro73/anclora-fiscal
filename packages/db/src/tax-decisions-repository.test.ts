import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleTaxDecisionsRepository } from './tax-decisions-repository';
import { canonicalOperations, legalEntities, tenants } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenantWithOperation(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
  const [legalEntity] = await db.insert(legalEntities).values({ tenantId: tenant.id, legalName: `${slug} SL`, countryCode: 'ES' }).returning({ id: legalEntities.id });
  if (!legalEntity) throw new Error('No se pudo crear la entidad legal de prueba');
  const [operation] = await db.insert(canonicalOperations).values({
    tenantId: tenant.id,
    legalEntityId: legalEntity.id,
    sourceChannel: 'SHOPIFY',
    sourceOrderId: `${slug}-order-1`,
    operationType: 'SALE',
    operationStatus: 'OPEN',
    reviewStatus: 'PENDING',
    reconciliationStatus: 'MATCHED',
    verifactuStatus: 'PENDING',
  }).returning({ id: canonicalOperations.id });
  if (!operation) throw new Error('No se pudo crear la operación canónica de prueba');
  return { tenantId: tenant.id, canonicalOperationId: operation.id };
}

describe('DrizzleTaxDecisionsRepository', () => {
  it('crea una decisión fiscal para el tenant', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const { tenantId, canonicalOperationId } = await seedTenantWithOperation(db, 'tenant-a');
    const repository = new DrizzleTaxDecisionsRepository(db);

    const created = await repository.create(tenantId, {
      canonicalOperationId,
      ruleId: 'ES_GENERAL_21',
      ruleVersion: '1',
      status: 'DETERMINED',
      taxBase: '6.72',
      taxRate: '0.21',
      taxAmount: '1.41',
      totalAmount: '8.13',
      explanation: ['tasa general aplicada'],
    });

    expect(created.tenantId).toBe(tenantId);
    expect(created.canonicalOperationId).toBe(canonicalOperationId);
    expect(created.status).toBe('DETERMINED');
    expect(created.ruleId).toBe('ES_GENERAL_21');
  });

  it('nunca mezcla decisiones fiscales entre tenants', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantA = await seedTenantWithOperation(db, 'tenant-a');
    const tenantB = await seedTenantWithOperation(db, 'tenant-b');
    const repository = new DrizzleTaxDecisionsRepository(db);

    const createdForA = await repository.create(tenantA.tenantId, {
      canonicalOperationId: tenantA.canonicalOperationId,
      status: 'DETERMINED',
      explanation: ['tenant A'],
    });
    const createdForB = await repository.create(tenantB.tenantId, {
      canonicalOperationId: tenantB.canonicalOperationId,
      status: 'BLOCKED',
      explanation: ['tenant B'],
    });

    expect(createdForA.tenantId).toBe(tenantA.tenantId);
    expect(createdForB.tenantId).toBe(tenantB.tenantId);
    expect(createdForA.id).not.toBe(createdForB.id);
  });
});
