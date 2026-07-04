import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleLegalEntitiesRepository } from './legal-entities-repository';
import { legalEntities, tenants } from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenant(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');
  return tenant.id;
}

describe('DrizzleLegalEntitiesRepository', () => {
  it('devuelve la primera entidad legal creada para un tenant', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-a');
    await db.insert(legalEntities).values({ tenantId, legalName: 'Primera SL', countryCode: 'ES' });
    await db.insert(legalEntities).values({ tenantId, legalName: 'Segunda SL', countryCode: 'ES' });
    const repository = new DrizzleLegalEntitiesRepository(db);

    const found = await repository.findFirstByTenant(tenantId);
    expect(found?.legalName).toBe('Primera SL');
  });

  it('devuelve undefined si el tenant no tiene entidad legal configurada', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await seedTenant(db, 'tenant-sin-entidad');
    const repository = new DrizzleLegalEntitiesRepository(db);

    const found = await repository.findFirstByTenant(tenantId);
    expect(found).toBeUndefined();
  });

  it('nunca devuelve la entidad legal de otro tenant', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantAId = await seedTenant(db, 'tenant-a');
    const tenantBId = await seedTenant(db, 'tenant-b');
    await db.insert(legalEntities).values({ tenantId: tenantBId, legalName: 'Tenant B SL', countryCode: 'ES' });
    const repository = new DrizzleLegalEntitiesRepository(db);

    const found = await repository.findFirstByTenant(tenantAId);
    expect(found).toBeUndefined();
  });
});
