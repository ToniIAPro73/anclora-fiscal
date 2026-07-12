import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleSifEventsRepository } from './sif-events-repository';
import { DrizzleSystemAlertsRepository } from './system-alerts-repository';
import { tenants, users } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];
afterEach(async () => Promise.all(clients.splice(0).map((client) => client.close())));

describe('DrizzleSystemAlertsRepository', () => {
  it('abre una alerta de integridad, evita duplicados y deja resolución en SIF/auditoría', async () => {
    const { db, client } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const [tenant] = await db.insert(tenants).values({ name: 'Alertas', slug: 'alertas' }).returning();
    if (!tenant) throw new Error('tenant');
    const [actor] = await db.insert(users).values({ tenantId: tenant.id, emailEncrypted: 'x', displayName: 'Revisor', passwordHash: 'x' }).returning();
    if (!actor) throw new Error('actor');
    const sif = new DrizzleSifEventsRepository(db);
    const repository = new DrizzleSystemAlertsRepository(db, sif);
    const first = await repository.open({ tenantId: tenant.id, severity: 'CRITICAL', type: 'INTEGRITY', source: 'test', detail: {}, deduplicationKey: 'same', eventType: 'INTEGRITY_ERROR' });
    const duplicate = await repository.open({ tenantId: tenant.id, severity: 'CRITICAL', type: 'INTEGRITY', source: 'test', detail: {}, deduplicationKey: 'same' });
    expect(duplicate.id).toBe(first.id);
    await repository.resolve({ tenantId: tenant.id, alertId: first.id, actorId: actor.id, resolution: 'Verificado contra copia íntegra' });
    expect((await repository.list({ tenantId: tenant.id, status: 'OPEN' }))).toHaveLength(0);
    expect((await repository.list({ tenantId: tenant.id, status: 'RESOLVED' }))).toHaveLength(1);
    expect((await sif.list({ tenantId: tenant.id, page: 1, pageSize: 10 })).items.map((event) => event.eventType)).toContain('ALERT_RESOLVED');
  });

  it('aísla alertas por tenant', async () => {
    const { db, client } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const [a, b] = await db.insert(tenants).values([{ name: 'A', slug: 'a-alert' }, { name: 'B', slug: 'b-alert' }]).returning();
    if (!a || !b) throw new Error('tenants');
    const repository = new DrizzleSystemAlertsRepository(db, new DrizzleSifEventsRepository(db));
    await repository.open({ tenantId: a.id, severity: 'CRITICAL', type: 'X', source: 'test', detail: {}, deduplicationKey: 'x' });
    expect(await repository.list({ tenantId: b.id, status: 'OPEN' })).toHaveLength(0);
  });
});
