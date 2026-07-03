import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleFinancialEventsRepository } from './financial-events-repository';
import { financialEvents, tenants } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenantWithEvents(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string, eventTypes: string[]) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');

  for (const [index, eventType] of eventTypes.entries()) {
    await db.insert(financialEvents).values({
      tenantId: tenant.id,
      sourceChannel: 'STRIPE',
      externalEventId: `${slug}-evt-${index}`,
      eventType,
      amount: '100.00',
      feeAmount: '2.90',
      netAmount: '97.10',
      currency: 'EUR',
      occurredAt: new Date(),
    });
  }
  return tenant.id;
}

describe('DrizzleFinancialEventsRepository', () => {
  it('pagina y filtra por eventType dentro de un único tenant', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenantWithEvents(db, 'tenant-a', ['PAYMENT', 'PAYMENT', 'REFUND']);
    const repository = new DrizzleFinancialEventsRepository(db);

    const firstPage = await repository.list({ tenantId, page: 1, pageSize: 2 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);

    const secondPage = await repository.list({ tenantId, page: 2, pageSize: 2 });
    expect(secondPage.items).toHaveLength(1);

    const filtered = await repository.list({ tenantId, page: 1, pageSize: 10, eventType: 'REFUND' });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.eventType).toBe('REFUND');
  });

  it('nunca devuelve eventos de otro tenant en la página del tenant A', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantAId = await seedTenantWithEvents(db, 'tenant-a', ['PAYMENT']);
    const tenantBId = await seedTenantWithEvents(db, 'tenant-b', ['PAYMENT', 'PAYMENT']);
    const repository = new DrizzleFinancialEventsRepository(db);

    const tenantAPage = await repository.list({ tenantId: tenantAId, page: 1, pageSize: 20 });
    expect(tenantAPage.total).toBe(1);
    expect(tenantAPage.items.every((item) => item.tenantId === tenantAId)).toBe(true);
    expect(tenantAPage.items.some((item) => item.tenantId === tenantBId)).toBe(false);
  });
});
