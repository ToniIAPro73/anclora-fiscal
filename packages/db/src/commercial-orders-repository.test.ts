import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleCommercialOrdersRepository } from './commercial-orders-repository';
import { tenants } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenant(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
  return tenant.id;
}

describe('DrizzleCommercialOrdersRepository', () => {
  it('crea un pedido comercial y lo recupera por externalOrderId', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const repository = new DrizzleCommercialOrdersRepository(db);

    const created = await repository.create(tenantId, {
      sourceChannel: 'SHOPIFY',
      externalOrderId: 'order-1',
      checkoutReference: 'checkout-1',
      commercialDate: new Date('2026-06-01'),
    });
    expect(created.externalOrderId).toBe('order-1');

    const found = await repository.findByExternalOrderId(tenantId, 'order-1');
    expect(found?.id).toBe(created.id);
  });

  it('persiste customerCountry, customerType y productNature al crear y al crear en lote', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const repository = new DrizzleCommercialOrdersRepository(db);

    const created = await repository.create(tenantId, {
      sourceChannel: 'SHOPIFY',
      externalOrderId: 'order-evidence-1',
      customerCountry: 'ES',
      customerType: 'B2C',
      productNature: 'general',
    });
    expect(created.customerCountry).toBe('ES');
    expect(created.customerType).toBe('B2C');
    expect(created.productNature).toBe('general');

    const [createdMany] = await repository.createMany(tenantId, [
      { sourceChannel: 'SHOPIFY', externalOrderId: 'order-evidence-2', customerType: 'B2C', productNature: 'general' },
    ]);
    expect(createdMany?.customerCountry).toBeFalsy();
    expect(createdMany?.customerType).toBe('B2C');
    expect(createdMany?.productNature).toBe('general');
  });

  it('devuelve undefined si el pedido no existe para ese tenant', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const repository = new DrizzleCommercialOrdersRepository(db);

    const found = await repository.findByExternalOrderId(tenantId, 'no-existe');
    expect(found).toBeUndefined();
  });

  it('pagina los pedidos de un tenant', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    const repository = new DrizzleCommercialOrdersRepository(db);

    for (const index of [1, 2, 3]) {
      await repository.create(tenantId, {
        sourceChannel: 'SHOPIFY',
        externalOrderId: `order-${index}`,
        checkoutReference: `checkout-${index}`,
        commercialDate: new Date(`2026-06-0${index}`),
      });
    }

    const firstPage = await repository.listByTenant({ tenantId, page: 1, pageSize: 2 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);

    const secondPage = await repository.listByTenant({ tenantId, page: 2, pageSize: 2 });
    expect(secondPage.items).toHaveLength(1);
  });

  it('nunca devuelve ni encuentra pedidos de otro tenant', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantAId = await seedTenant(db, 'tenant-a');
    const tenantBId = await seedTenant(db, 'tenant-b');
    const repository = new DrizzleCommercialOrdersRepository(db);

    await repository.create(tenantAId, {
      sourceChannel: 'SHOPIFY',
      externalOrderId: 'shared-external-id',
      checkoutReference: 'checkout-a',
      commercialDate: new Date('2026-06-01'),
    });
    await repository.create(tenantBId, {
      sourceChannel: 'SHOPIFY',
      externalOrderId: 'shared-external-id',
      checkoutReference: 'checkout-b',
      commercialDate: new Date('2026-06-01'),
    });

    const foundForA = await repository.findByExternalOrderId(tenantAId, 'shared-external-id');
    expect(foundForA?.checkoutReference).toBe('checkout-a');

    const listForA = await repository.listByTenant({ tenantId: tenantAId, page: 1, pageSize: 10 });
    expect(listForA.total).toBe(1);
    expect(listForA.items.every((item) => item.tenantId === tenantAId)).toBe(true);
  });
});
