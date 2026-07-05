import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleFiscalConfigurationRepository } from './fiscal-configuration-repository';
import { auditEvents, tenants, users } from './schema';
import { eq } from 'drizzle-orm';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];
afterEach(async () => Promise.all(clients.splice(0).map((client) => client.close())));

async function seed(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning();
  if (!tenant) throw new Error('tenant');
  const [actor] = await db.insert(users).values({ tenantId: tenant.id, emailEncrypted: `${slug}@test`, displayName: slug, passwordHash: 'hash' }).returning();
  if (!actor) throw new Error('actor');
  return { tenantId: tenant.id, actorId: actor.id };
}

const minimum = (tenantId: string, actorId: string) => ({ tenantId, actorId, legalEntity: { legalName: 'Editorial Test SL', countryCode: 'ES', currencyCode: 'EUR', address: 'Calle Uno', taxIdentityEncrypted: 'ciphertext' }, series: { code: 'F', fiscalYear: 2026, documentType: 'FULL_INVOICE' }, productProfile: { selector: 'ebook-*', productNature: 'ebook', invoiceDescription: 'Libro electrónico', domesticTaxCode: 'ES_IVA_4', domesticTaxRate: '0.04', ossEligible: true, shippingRequired: false, effectiveFrom: '2026-01-01' }, kdpPolicy: { version: '1', effectiveFrom: '2026-01-01', accountingPolicy: 'NET_ROYALTY_ONLY' as const, embeddedCostTreatment: 'INCLUDED_IN_NET', reviewLevel: 'REVIEW_REQUIRED' } });

describe('DrizzleFiscalConfigurationRepository', () => {
  it('persiste la configuración mínima, aplica NET_ROYALTY_ONLY y audita', async () => {
    const { client, db } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const ids = await seed(db, 'tenant-a'); const repository = new DrizzleFiscalConfigurationRepository(db);
    const result = await repository.saveMinimum(minimum(ids.tenantId, ids.actorId));
    expect(result.readiness).toEqual({ ready: true, missing: [] });
    expect(result.channelPolicies[0]?.kdpAccountingPolicy).toBe('NET_ROYALTY_ONLY');
    expect(await repository.getTaxEngineConfig(ids.tenantId)).toMatchObject({ id: `TENANT_${ids.tenantId}`, rates: [{ id: 'ES_IVA_4', rate: 0.04 }] });
    expect(await db.select().from(auditEvents).where(eq(auditEvents.tenantId, ids.tenantId))).toHaveLength(1);
  });

  it('mantiene aislamiento estricto entre tenants', async () => {
    const { client, db } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
    const a = await seed(db, 'tenant-a'); const b = await seed(db, 'tenant-b'); const repository = new DrizzleFiscalConfigurationRepository(db);
    await repository.saveMinimum(minimum(a.tenantId, a.actorId));
    expect((await repository.get(b.tenantId)).readiness.ready).toBe(false);
    expect((await repository.get(b.tenantId)).legalEntity).toBeNull();
  });
});
