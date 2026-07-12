import { afterEach, describe, expect, it } from 'vitest';
import { decryptTaxIdentity } from '@anclora/core/server';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleFiscalCounterpartiesRepository } from './fiscal-counterparties-repository';
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

describe('DrizzleFiscalCounterpartiesRepository', () => {
  it('rechaza un NIF/NIE con checksum inválido', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleFiscalCounterpartiesRepository(db);
    const tenantId = await seedTenant(db, 'tenant-counterparty-invalid');

    const result = await repository.create({
      tenantId,
      displayName: 'Empresa Ejemplo SL',
      companyName: 'Empresa Ejemplo SL',
      billingAddress: 'Calle Falsa 123, Madrid',
      taxIdentity: '12345678A',
      customerType: 'B2B',
    });

    expect(result).toEqual({ ok: false, reason: 'INVALID_TAX_IDENTITY' });
  });

  it('persiste un destinatario válido, cifrado, y marcado como validado explícitamente', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleFiscalCounterpartiesRepository(db);
    const tenantId = await seedTenant(db, 'tenant-counterparty-valid');

    const result = await repository.create({
      tenantId,
      displayName: 'Ana García',
      email: 'ana@example.test',
      billingAddress: 'Calle Mayor 1, Madrid',
      taxIdentity: '12345678Z',
      customerType: 'B2C',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.counterparty.validationStatus).toBe('VALIDATED');
    expect(result.counterparty.validationSource).toBe('BUYER_REQUEST_EXPLICIT');
    expect(result.counterparty.validatedAt).not.toBeNull();
    expect(decryptTaxIdentity(result.counterparty.taxIdentityEncrypted!)).toBe('12345678Z');
    expect(decryptTaxIdentity(result.counterparty.billingAddressEncrypted!)).toBe('Calle Mayor 1, Madrid');

    const found = await repository.findById(tenantId, result.counterparty.id);
    expect(found?.id).toBe(result.counterparty.id);
  });

  it('no encuentra destinatarios de otro tenant', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleFiscalCounterpartiesRepository(db);
    const tenantA = await seedTenant(db, 'tenant-counterparty-a');
    const tenantB = await seedTenant(db, 'tenant-counterparty-b');

    const created = await repository.create({
      tenantId: tenantA,
      displayName: 'Empresa A',
      billingAddress: 'Calle A, Madrid',
      taxIdentity: '12345678Z',
      customerType: 'B2C',
    });
    if (!created.ok) throw new Error('expected ok result');

    expect(await repository.findById(tenantB, created.counterparty.id)).toBeNull();
  });
});
