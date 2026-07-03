import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzlePeriodClosesRepository } from './period-closes-repository';
import { auditEvents, canonicalOperations, issues, legalEntities, tenants, users } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenant(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');

  const [actor] = await db.insert(users).values({
    tenantId: tenant.id,
    emailEncrypted: `${slug}-actor@example.test`,
    displayName: `${slug}-actor`,
    passwordHash: 'hash',
  }).returning({ id: users.id });
  if (!actor) throw new Error('No se pudo crear el actor de prueba');

  const [legalEntity] = await db.insert(legalEntities).values({
    tenantId: tenant.id,
    legalName: `${slug} legal entity`,
    countryCode: 'ES',
  }).returning({ id: legalEntities.id });
  if (!legalEntity) throw new Error('No se pudo crear la entidad legal de prueba');

  return { tenantId: tenant.id, actorId: actor.id, legalEntityId: legalEntity.id };
}

async function seedOperation(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  tenantId: string,
  legalEntityId: string,
) {
  const [operation] = await db.insert(canonicalOperations).values({
    tenantId,
    legalEntityId,
    sourceChannel: 'shopify',
    sourceOrderId: 'ORDER-1',
    operationType: 'SALE',
    operationStatus: 'READY_FOR_INVOICING',
    reviewStatus: 'REVIEWED',
    reconciliationStatus: 'MATCHED',
    verifactuStatus: 'PENDING',
  }).returning({ id: canonicalOperations.id });
  if (!operation) throw new Error('No se pudo crear la operación de prueba');
  return operation.id;
}

const PERIOD = new Date().toISOString().slice(0, 7);

describe('DrizzlePeriodClosesRepository', () => {
  describe('close', () => {
    it('rechaza el cierre listando los issues BLOCKING abiertos del período', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, legalEntityId } = await seedTenant(db, 'tenant-a');
      const operationId = await seedOperation(db, tenantId, legalEntityId);
      const [issue] = await db.insert(issues).values({
        tenantId,
        canonicalOperationId: operationId,
        code: 'MISSING_EVIDENCE',
        severity: 'BLOCKING',
        status: 'OPEN',
        title: 'Falta evidencia',
        explanation: 'No hay documento de respaldo',
      }).returning({ id: issues.id });
      if (!issue) throw new Error('No se pudo crear el issue de prueba');
      const repository = new DrizzlePeriodClosesRepository(db);

      const result = await repository.close(tenantId, PERIOD, actorId);

      expect(result).toEqual({ ok: false, reason: 'BLOCKING_ISSUES_OPEN', issueIds: [issue.id] });
    });

    it('cierra el período una vez resuelto el issue BLOCKING', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, legalEntityId } = await seedTenant(db, 'tenant-a');
      const operationId = await seedOperation(db, tenantId, legalEntityId);
      const [issue] = await db.insert(issues).values({
        tenantId,
        canonicalOperationId: operationId,
        code: 'MISSING_EVIDENCE',
        severity: 'BLOCKING',
        status: 'OPEN',
        title: 'Falta evidencia',
        explanation: 'No hay documento de respaldo',
      }).returning({ id: issues.id });
      if (!issue) throw new Error('No se pudo crear el issue de prueba');
      const repository = new DrizzlePeriodClosesRepository(db);

      const rejected = await repository.close(tenantId, PERIOD, actorId);
      expect(rejected.ok).toBe(false);

      await db.update(issues).set({ status: 'RESOLVED' }).where(eq(issues.id, issue.id));

      const result = await repository.close(tenantId, PERIOD, actorId);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');
      expect(result.alreadyClosed).toBe(false);
      expect(result.periodClose.status).toBe('CLOSED');
      expect(result.periodClose.approvedBy).toBe(actorId);
      expect(result.periodClose.frozenAt).not.toBeNull();

      const events = await db.select().from(auditEvents).where(eq(auditEvents.tenantId, tenantId));
      expect(events.filter((event) => event.action === 'PERIOD_CLOSED')).toHaveLength(1);
    });

    it('es idempotente: cerrar dos veces un período ya cerrado devuelve la misma fila sin duplicar el evento de auditoría', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId } = await seedTenant(db, 'tenant-a');
      const repository = new DrizzlePeriodClosesRepository(db);

      const first = await repository.close(tenantId, PERIOD, actorId);
      const second = await repository.close(tenantId, PERIOD, actorId);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected ok results');
      expect(second.periodClose.id).toBe(first.periodClose.id);
      expect(second.alreadyClosed).toBe(true);

      const events = await db.select().from(auditEvents).where(eq(auditEvents.tenantId, tenantId));
      expect(events.filter((event) => event.action === 'PERIOD_CLOSED')).toHaveLength(1);
    });
  });

  describe('reopen', () => {
    it('reabre un período cerrado y preserva el historial de auditoría del cierre previo', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId } = await seedTenant(db, 'tenant-a');
      const repository = new DrizzlePeriodClosesRepository(db);

      const closed = await repository.close(tenantId, PERIOD, actorId);
      expect(closed.ok).toBe(true);
      if (!closed.ok) throw new Error('expected ok result');

      const result = await repository.reopen(tenantId, PERIOD, actorId);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');
      expect(result.periodClose.status).toBe('REOPENED_WITH_AUDIT_TRAIL');
      expect(result.periodClose.id).toBe(closed.periodClose.id);

      const events = await db.select().from(auditEvents).where(eq(auditEvents.tenantId, tenantId));
      expect(events.filter((event) => event.action === 'PERIOD_CLOSED')).toHaveLength(1);
      expect(events.filter((event) => event.action === 'PERIOD_REOPENED')).toHaveLength(1);
    });

    it('devuelve PERIOD_NOT_CLOSED cuando el período no está cerrado', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId } = await seedTenant(db, 'tenant-a');
      const repository = new DrizzlePeriodClosesRepository(db);

      const result = await repository.reopen(tenantId, PERIOD, actorId);

      expect(result).toEqual({ ok: false, reason: 'PERIOD_NOT_CLOSED' });
    });

    it('devuelve PERIOD_NOT_CLOSED al intentar reabrir un período ya reabierto', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId } = await seedTenant(db, 'tenant-a');
      const repository = new DrizzlePeriodClosesRepository(db);

      const closed = await repository.close(tenantId, PERIOD, actorId);
      expect(closed.ok).toBe(true);
      await repository.reopen(tenantId, PERIOD, actorId);

      const result = await repository.reopen(tenantId, PERIOD, actorId);

      expect(result).toEqual({ ok: false, reason: 'PERIOD_NOT_CLOSED' });
    });
  });
});
