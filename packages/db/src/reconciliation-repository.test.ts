import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleReconciliationRepository } from './reconciliation-repository';
import { commercialOrders, financialEvents, matchingCandidates, tenants } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenantWithCandidates(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  slug: string,
  candidates: Array<{ accepted: boolean }>,
) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');

  for (const [index, candidate] of candidates.entries()) {
    const [order] = await db.insert(commercialOrders).values({
      tenantId: tenant.id,
      sourceChannel: 'SHOPIFY',
      externalOrderId: `${slug}-order-${index}`,
    }).returning({ id: commercialOrders.id });
    if (!order) throw new Error('No se pudo crear la orden de prueba');

    const [event] = await db.insert(financialEvents).values({
      tenantId: tenant.id,
      sourceChannel: 'STRIPE',
      externalEventId: `${slug}-evt-${index}`,
      eventType: 'PAYMENT',
      amount: '100.00',
      feeAmount: '2.90',
      netAmount: '97.10',
      currency: 'EUR',
      occurredAt: new Date(),
    }).returning({ id: financialEvents.id });
    if (!event) throw new Error('No se pudo crear el evento financiero de prueba');

    await db.insert(matchingCandidates).values({
      tenantId: tenant.id,
      commercialOrderId: order.id,
      financialEventId: event.id,
      confidence: '0.9500',
      explanation: { rule: 'test' },
      accepted: candidate.accepted,
    });
  }
  return tenant.id;
}

describe('DrizzleReconciliationRepository', () => {
  it('pagina y filtra por accepted dentro de un único tenant', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenantWithCandidates(db, 'tenant-a', [
      { accepted: true },
      { accepted: true },
      { accepted: false },
    ]);
    const repository = new DrizzleReconciliationRepository(db);

    const firstPage = await repository.list({ tenantId, page: 1, pageSize: 2 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);

    const secondPage = await repository.list({ tenantId, page: 2, pageSize: 2 });
    expect(secondPage.items).toHaveLength(1);

    const filtered = await repository.list({ tenantId, page: 1, pageSize: 10, accepted: false });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.accepted).toBe(false);
    expect(filtered.items[0]?.commercialOrderExternalId).toBe('tenant-a-order-2');
    expect(filtered.items[0]?.financialEventExternalId).toBe('tenant-a-evt-2');
  });

  it('nunca devuelve candidatos de otro tenant en la página del tenant A', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantAId = await seedTenantWithCandidates(db, 'tenant-a', [{ accepted: true }]);
    const tenantBId = await seedTenantWithCandidates(db, 'tenant-b', [{ accepted: true }, { accepted: false }]);
    const repository = new DrizzleReconciliationRepository(db);

    const tenantAPage = await repository.list({ tenantId: tenantAId, page: 1, pageSize: 20 });
    expect(tenantAPage.total).toBe(1);
    expect(tenantAPage.items.every((item) => item.tenantId === tenantAId)).toBe(true);
    expect(tenantAPage.items.some((item) => item.tenantId === tenantBId)).toBe(false);
  });

  it('createCandidates() es idempotente: volver a matchear el mismo par pedido/evento no duplica la fila', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const [tenant] = await db.insert(tenants).values({ name: 'tenant-idempotent', slug: 'tenant-idempotent' }).returning({ id: tenants.id });
    if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
    const [order] = await db.insert(commercialOrders).values({ tenantId: tenant.id, sourceChannel: 'SHOPIFY', externalOrderId: 'AI-9001' }).returning({ id: commercialOrders.id });
    if (!order) throw new Error('No se pudo crear la orden de prueba');
    const [event] = await db.insert(financialEvents).values({ tenantId: tenant.id, sourceChannel: 'SHOPIFY', externalEventId: 'evt-9001', eventType: 'charge', amount: '6.99', feeAmount: '0.35', netAmount: '6.64', currency: 'EUR', occurredAt: new Date() }).returning({ id: financialEvents.id });
    if (!event) throw new Error('No se pudo crear el evento financiero de prueba');
    const repository = new DrizzleReconciliationRepository(db);

    const candidate = { commercialOrderId: order.id, financialEventId: event.id, confidence: 1, explanation: { signals: ['Coincidencia exacta por número de pedido'] } };
    await repository.createCandidates(tenant.id, [candidate]);
    await repository.createCandidates(tenant.id, [candidate]);

    const page = await repository.list({ tenantId: tenant.id, page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
  });
});
