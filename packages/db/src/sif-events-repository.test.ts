import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleSifEventsRepository } from './sif-events-repository';
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

describe('DrizzleSifEventsRepository', () => {
  it('encadena eventos consecutivos por tenant y verifica la cadena', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleSifEventsRepository(db);
    const tenantId = await seedTenant(db, 'tenant-sif-chain');

    const first = await repository.record({ tenantId, eventType: 'STARTUP', actor: 'system', detail: { version: '1.0.0' } });
    const second = await repository.record({ tenantId, eventType: 'INTEGRITY_ERROR', actor: 'system', detail: { documentId: 'doc-1' } });

    expect(first.previousHash).toBeNull();
    expect(second.previousHash).toBe(first.hash);
    expect(await repository.verifyChain(tenantId)).toBe(true);
  });

  it('mantiene cadenas independientes por tenant', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleSifEventsRepository(db);
    const tenantA = await seedTenant(db, 'tenant-sif-a');
    const tenantB = await seedTenant(db, 'tenant-sif-b');

    await repository.record({ tenantId: tenantA, eventType: 'STARTUP', actor: 'system', detail: {} });
    const firstB = await repository.record({ tenantId: tenantB, eventType: 'STARTUP', actor: 'system', detail: {} });

    expect(firstB.previousHash).toBeNull();

    const listA = await repository.list({ tenantId: tenantA, page: 1, pageSize: 10 });
    const listB = await repository.list({ tenantId: tenantB, page: 1, pageSize: 10 });

    expect(listA.total).toBe(1);
    expect(listB.total).toBe(1);
  });

  it('detecta una cadena rota si un evento se modifica directamente en la base de datos', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleSifEventsRepository(db);
    const tenantId = await seedTenant(db, 'tenant-sif-tamper');

    await repository.record({ tenantId, eventType: 'STARTUP', actor: 'system', detail: {} });
    const second = await repository.record({ tenantId, eventType: 'ANOMALY', actor: 'system', detail: { code: 'X' } });

    const { sifEvents } = await import('./schema');
    const { eq } = await import('drizzle-orm');
    await db.update(sifEvents).set({ canonicalPayload: second.canonicalPayload.replace('ANOMALY', 'STARTUP') }).where(eq(sifEvents.id, second.id));

    expect(await repository.verifyChain(tenantId)).toBe(false);
  });

  it('pagina los eventos más recientes primero', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleSifEventsRepository(db);
    const tenantId = await seedTenant(db, 'tenant-sif-pagination');

    await repository.record({ tenantId, eventType: 'STARTUP', actor: 'system', detail: { n: 1 } });
    await repository.record({ tenantId, eventType: 'SHUTDOWN', actor: 'system', detail: { n: 2 } });
    await repository.record({ tenantId, eventType: 'ANOMALY', actor: 'system', detail: { n: 3 } });

    const page1 = await repository.list({ tenantId, page: 1, pageSize: 2 });
    const page2 = await repository.list({ tenantId, page: 2, pageSize: 2 });

    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0]?.eventType).toBe('ANOMALY');
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.eventType).toBe('STARTUP');
  });

  it('registra STARTUP una sola vez por despliegue y tenant', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const repository = new DrizzleSifEventsRepository(db);
    const tenantId = await seedTenant(db, 'tenant-startup');
    await repository.recordStartupForAll('deploy-1');
    await repository.recordStartupForAll('deploy-1');
    expect((await repository.list({ tenantId, page: 1, pageSize: 10 })).total).toBe(1);
  });
});
