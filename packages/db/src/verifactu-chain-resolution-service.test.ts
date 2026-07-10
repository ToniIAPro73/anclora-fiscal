import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleVerifactuChainResolutionService } from './verifactu-chain-resolution-service';
import {
  canonicalOperations,
  fiscalDocuments,
  integrityChainRecords,
  legalEntities,
  tenants,
} from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedTenantAndLegalEntity(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  slug: string,
) {
  const [tenant] = await db.insert(tenants).values({ name: slug, slug }).returning({ id: tenants.id });
  if (!tenant) throw new Error('No se pudo crear el tenant de prueba');

  const [legalEntity] = await db
    .insert(legalEntities)
    .values({ tenantId: tenant.id, legalName: `${slug} legal entity`, countryCode: 'ES' })
    .returning({ id: legalEntities.id });
  if (!legalEntity) throw new Error('No se pudo crear la entidad legal de prueba');

  return { tenantId: tenant.id, legalEntityId: legalEntity.id };
}

async function seedOfficialBillingRecord(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  input: {
    tenantId: string;
    legalEntityId: string;
    softwareInstallationNumber: string;
    number: string;
    issuedAt: Date;
    huella: string;
    withAeatMetadata?: boolean;
  },
) {
  const [operation] = await db
    .insert(canonicalOperations)
    .values({
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      sourceChannel: 'shopify',
      sourceOrderId: `ORDER-${input.number}`,
      operationType: 'SALE',
      operationStatus: 'READY_FOR_INVOICING',
      reviewStatus: 'REVIEWED',
      reconciliationStatus: 'MATCHED',
      verifactuStatus: 'PENDING',
    })
    .returning({ id: canonicalOperations.id });
  if (!operation) throw new Error('No se pudo crear la operación de prueba');

  const [document] = await db
    .insert(fiscalDocuments)
    .values({
      tenantId: input.tenantId,
      canonicalOperationId: operation.id,
      number: input.number,
      documentType: 'SIMPLIFICADA',
      status: 'ISSUED',
      issuedAt: input.issuedAt,
      taxBase: '6.72',
      taxAmount: '0.27',
      totalAmount: '6.99',
      currency: 'EUR',
      renderStorageKey: `tests/${input.number}.pdf`,
      renderSha256: `sha-${input.number}`,
    })
    .returning({ id: fiscalDocuments.id });
  if (!document) throw new Error('No se pudo crear el documento fiscal de prueba');

  await db.insert(integrityChainRecords).values({
    tenantId: input.tenantId,
    fiscalDocumentId: document.id,
    recordType: 'ALTA',
    canonicalPayload: `payload-${input.number}`,
    hash: `internal-hash-${input.number}`,
    legalEntityId: input.legalEntityId,
    softwareInstallationNumber: input.softwareInstallationNumber,
    ...(input.withAeatMetadata === false
      ? {}
      : {
          aeatIdEmisorFactura: '12345678Z',
          aeatNumSerieFactura: input.number,
          aeatFechaExpedicionFactura: input.issuedAt.toISOString().slice(0, 10),
          aeatTipoFactura: 'F1',
          aeatHuella: input.huella,
          aeatHuellaGeneratedAt: input.issuedAt,
          chainStatus: 'CONFIRMED',
        }),
  });

  return document.id;
}

describe('DrizzleVerifactuChainResolutionService.getPreviousOfficialBillingRecord', () => {
  it('devuelve el registro oficial AEAT emitido más recientemente respetando el orden temporal real, no el orden de inserción', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const { tenantId, legalEntityId } = await seedTenantAndLegalEntity(db, 'chain-order');

    // Se inserta primero (orden de inserción) el registro emitido MÁS TARDE,
    // y después (orden de inserción) el emitido ANTES -- para comprobar que
    // el resolver ordena por fecha de emisión real, no por createdAt.
    await seedOfficialBillingRecord(db, {
      tenantId,
      legalEntityId,
      softwareInstallationNumber: 'INSTALL-1',
      number: 'F-00002',
      issuedAt: new Date('2026-02-01T10:00:00Z'),
      huella: 'HUELLA-LATEST',
    });
    await seedOfficialBillingRecord(db, {
      tenantId,
      legalEntityId,
      softwareInstallationNumber: 'INSTALL-1',
      number: 'F-00001',
      issuedAt: new Date('2026-01-01T10:00:00Z'),
      huella: 'HUELLA-EARLIER',
    });

    const service = new DrizzleVerifactuChainResolutionService(db);
    const previous = await service.getPreviousOfficialBillingRecord({
      tenantId,
      legalEntityId,
      softwareInstallationNumber: 'INSTALL-1',
    });

    expect(previous).toMatchObject({
      idEmisorFactura: '12345678Z',
      numSerieFactura: 'F-00002',
      fechaExpedicionFactura: '2026-02-01',
      huella: 'HUELLA-LATEST',
    });
  });

  it('devuelve undefined cuando no existe ningún registro previo (primera factura)', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const { tenantId, legalEntityId } = await seedTenantAndLegalEntity(db, 'chain-first-invoice');

    const service = new DrizzleVerifactuChainResolutionService(db);
    const previous = await service.getPreviousOfficialBillingRecord({
      tenantId,
      legalEntityId,
      softwareInstallationNumber: 'INSTALL-1',
    });

    expect(previous).toBeUndefined();
  });

  it('ignora registros sin huella AEAT persistida todavía', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const { tenantId, legalEntityId } = await seedTenantAndLegalEntity(db, 'chain-no-huella');

    await seedOfficialBillingRecord(db, {
      tenantId,
      legalEntityId,
      softwareInstallationNumber: 'INSTALL-1',
      number: 'F-00001',
      issuedAt: new Date('2026-01-01T10:00:00Z'),
      huella: 'UNUSED',
      withAeatMetadata: false,
    });

    const service = new DrizzleVerifactuChainResolutionService(db);
    const previous = await service.getPreviousOfficialBillingRecord({
      tenantId,
      legalEntityId,
      softwareInstallationNumber: 'INSTALL-1',
    });

    expect(previous).toBeUndefined();
  });

  it('aísla estrictamente por tenant + legalEntity + softwareInstallation: sin fuga cruzada', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const tenantA = await seedTenantAndLegalEntity(db, 'chain-tenant-a');
    const tenantB = await seedTenantAndLegalEntity(db, 'chain-tenant-b');

    await seedOfficialBillingRecord(db, {
      tenantId: tenantA.tenantId,
      legalEntityId: tenantA.legalEntityId,
      softwareInstallationNumber: 'INSTALL-1',
      number: 'A-00001',
      issuedAt: new Date('2026-01-01T10:00:00Z'),
      huella: 'HUELLA-TENANT-A',
    });
    await seedOfficialBillingRecord(db, {
      tenantId: tenantB.tenantId,
      legalEntityId: tenantB.legalEntityId,
      softwareInstallationNumber: 'INSTALL-1',
      number: 'B-00001',
      issuedAt: new Date('2026-06-01T10:00:00Z'),
      huella: 'HUELLA-TENANT-B',
    });

    // Misma legalEntity de A, pero otra softwareInstallationNumber: tampoco debe verse.
    await seedOfficialBillingRecord(db, {
      tenantId: tenantA.tenantId,
      legalEntityId: tenantA.legalEntityId,
      softwareInstallationNumber: 'INSTALL-2',
      number: 'A-OTHER-INSTALL-00001',
      issuedAt: new Date('2026-12-01T10:00:00Z'),
      huella: 'HUELLA-OTHER-INSTALLATION',
    });

    const service = new DrizzleVerifactuChainResolutionService(db);
    const previousForTenantA = await service.getPreviousOfficialBillingRecord({
      tenantId: tenantA.tenantId,
      legalEntityId: tenantA.legalEntityId,
      softwareInstallationNumber: 'INSTALL-1',
    });

    expect(previousForTenantA).toMatchObject({
      idEmisorFactura: '12345678Z',
      numSerieFactura: 'A-00001',
      fechaExpedicionFactura: '2026-01-01',
      huella: 'HUELLA-TENANT-A',
    });
  });
});
