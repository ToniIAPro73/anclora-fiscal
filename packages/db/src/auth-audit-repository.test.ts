import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { DrizzleAuthAuditRepository } from './auth-audit-repository';
import { migrateOfflineDatabase } from './migrations';
import { tenants, users } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];
afterEach(async () => Promise.all(clients.splice(0).map((client) => client.close())));

describe('DrizzleAuthAuditRepository', () => {
  it('registra acceso y cierre asociados al actor y tenant existentes', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const [tenant] = await db.insert(tenants).values({ name: 'Tenant auth', slug: 'tenant-auth' }).returning({ id: tenants.id });
    const [actor] = await db.insert(users).values({
      tenantId: tenant!.id,
      emailEncrypted: 'test-only',
      displayName: 'Operador',
      passwordHash: 'external-directory',
    }).returning({ id: users.id });
    const repository = new DrizzleAuthAuditRepository(db);

    await repository.record({ tenantId: tenant!.id, actorId: actor!.id, action: 'LOGIN_SUCCEEDED', ipHash: 'a'.repeat(64) });
    await repository.record({ tenantId: tenant!.id, actorId: actor!.id, action: 'LOGOUT' });

    const result = await client.query<{ action: string; actor_id: string }>('SELECT action, actor_id FROM audit_events ORDER BY occurred_at');
    expect(result.rows).toEqual([
      { action: 'LOGIN_SUCCEEDED', actor_id: actor!.id },
      { action: 'LOGOUT', actor_id: actor!.id },
    ]);
  });
});
