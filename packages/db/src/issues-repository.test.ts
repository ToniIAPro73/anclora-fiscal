import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleIssuesRepository } from './issues-repository';
import { auditEvents, issues, tenants, users } from './schema';
import { eq } from 'drizzle-orm';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenantWithIssues(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  slug: string,
  seeded: Array<{ status?: string; severity?: string }>,
) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');

  const [actor] = await db.insert(users).values({
    tenantId: tenant.id,
    emailEncrypted: `${slug}-actor@example.test`,
    displayName: `${slug}-actor`,
    passwordHash: 'hash',
  }).returning({ id: users.id });
  if (!actor) throw new Error('No se pudo crear el actor de prueba');

  const ids: string[] = [];
  for (const [index, entry] of seeded.entries()) {
    const [issue] = await db.insert(issues).values({
      tenantId: tenant.id,
      code: `ISSUE-${index}`,
      severity: entry.severity ?? 'HIGH',
      status: entry.status ?? 'OPEN',
      title: `Issue ${index}`,
      explanation: 'Test explanation',
    }).returning({ id: issues.id });
    if (!issue) throw new Error('No se pudo crear el issue de prueba');
    ids.push(issue.id);
  }
  return { tenantId: tenant.id, actorId: actor.id, ids };
}

describe('DrizzleIssuesRepository', () => {
  describe('list', () => {
    it('pagina y filtra por status y severity dentro de un único tenant', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId } = await seedTenantWithIssues(db, 'tenant-a', [
        { status: 'OPEN', severity: 'HIGH' },
        { status: 'OPEN', severity: 'LOW' },
        { status: 'RESOLVED', severity: 'HIGH' },
      ]);
      const repository = new DrizzleIssuesRepository(db);

      const firstPage = await repository.list({ tenantId, page: 1, pageSize: 2 });
      expect(firstPage.total).toBe(3);
      expect(firstPage.items).toHaveLength(2);

      const secondPage = await repository.list({ tenantId, page: 2, pageSize: 2 });
      expect(secondPage.items).toHaveLength(1);

      const byStatus = await repository.list({ tenantId, page: 1, pageSize: 10, status: 'RESOLVED' });
      expect(byStatus.total).toBe(1);
      expect(byStatus.items[0]?.severity).toBe('HIGH');

      const bySeverity = await repository.list({ tenantId, page: 1, pageSize: 10, severity: 'LOW' });
      expect(bySeverity.total).toBe(1);
      expect(bySeverity.items[0]?.status).toBe('OPEN');

      const byBoth = await repository.list({ tenantId, page: 1, pageSize: 10, status: 'OPEN', severity: 'HIGH' });
      expect(byBoth.total).toBe(1);
    });

    it('nunca devuelve issues de otro tenant', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId: tenantAId } = await seedTenantWithIssues(db, 'tenant-a', [{}]);
      const { tenantId: tenantBId } = await seedTenantWithIssues(db, 'tenant-b', [{}, {}]);
      const repository = new DrizzleIssuesRepository(db);

      const tenantAPage = await repository.list({ tenantId: tenantAId, page: 1, pageSize: 20 });
      expect(tenantAPage.total).toBe(1);
      expect(tenantAPage.items.every((item) => item.tenantId === tenantAId)).toBe(true);
      expect(tenantAPage.items.some((item) => item.tenantId === tenantBId)).toBe(false);
    });
  });

  describe('resolve', () => {
    it('resuelve un issue del propio tenant e inserta un audit event', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, ids } = await seedTenantWithIssues(db, 'tenant-a', [{ status: 'OPEN' }]);
      const repository = new DrizzleIssuesRepository(db);

      const resolved = await repository.resolve(tenantId, ids[0]!, actorId);
      expect(resolved?.status).toBe('RESOLVED');

      const events = await db.select().from(auditEvents).where(eq(auditEvents.entityId, ids[0]!));
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('ISSUE_RESOLVED');
      expect(events[0]?.tenantId).toBe(tenantId);
    });

    it('devuelve null en un intento de resolución cruzada entre tenants', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { actorId } = await seedTenantWithIssues(db, 'tenant-a', [{ status: 'OPEN' }]);
      const { ids: tenantBIds } = await seedTenantWithIssues(db, 'tenant-b', [{ status: 'OPEN' }]);
      const repository = new DrizzleIssuesRepository(db);

      const otherTenantId = '00000000-0000-0000-0000-000000000000';
      const resolved = await repository.resolve(otherTenantId, tenantBIds[0]!, actorId);
      expect(resolved).toBeNull();
    });

    it('es idempotente: resolver un issue ya resuelto devuelve la fila existente', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, ids } = await seedTenantWithIssues(db, 'tenant-a', [{ status: 'RESOLVED' }]);
      const repository = new DrizzleIssuesRepository(db);

      const resolved = await repository.resolve(tenantId, ids[0]!, actorId);
      expect(resolved?.status).toBe('RESOLVED');
      expect(resolved?.id).toBe(ids[0]);
    });
  });
});
