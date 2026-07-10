import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  encryptTaxIdentity,
  resolveVerifactuRuntimeConfig,
  verifyIntegrityChain,
  type IntegrityRecord,
  type StoragePort,
  type StoredObject,
} from '@anclora/core/server';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleFiscalDocumentsRepository } from './fiscal-documents-repository';
import {
  auditEvents,
  canonicalOperations,
  fiscalDocuments,
  importFiles,
  importJobs,
  integrityChainRecords,
  invoiceSeries,
  legalEntities,
  productTaxProfiles,
  shopifyOrderPaymentEvents,
  taxDecisions,
  tenants,
  users,
  verifactuSubmissions,
} from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

class InMemoryStorage implements StoragePort {
  puts: Array<{ tenantId: string; bytes: Uint8Array; mimeType: string }> = [];
  private readonly objects = new Map<string, Uint8Array>();

  async put(input: { tenantId: string; bytes: Uint8Array; mimeType: string }): Promise<StoredObject> {
    this.puts.push(input);
    const key = `${input.tenantId}/${this.puts.length}`;
    this.objects.set(key, input.bytes);
    return { key, sha256: 'test-sha', size: input.bytes.byteLength, mimeType: input.mimeType };
  }

  async get(key: string): Promise<Uint8Array> {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error('not found');
    return bytes;
  }
}

async function seedOperationWithDecision(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  slug: string,
  buyerInfo?: { customerAddress?: string; customerEmail?: string; skipFiscalConfiguration?: boolean; documentType?: string },
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

  const [legalEntity] = await db
  .insert(legalEntities)
  .values({
    tenantId: tenant.id,
    legalName: `${slug} legal entity`,
    countryCode: 'ES',
    address: buyerInfo?.skipFiscalConfiguration
      ? undefined
      : 'Calle Fiscal 1',
    taxIdentityEncrypted: encryptTaxIdentity('12345678Z'),
    taxIdentityConfigured: true,
    fiscalConfigurationStatus: 'COMPLETA',
    configurationStatus: buyerInfo?.skipFiscalConfiguration
      ? 'INCOMPLETE'
      : 'READY',
  })
  .returning({
    id: legalEntities.id,
  });
  if (!legalEntity) throw new Error('No se pudo crear la entidad legal de prueba');
  if (!buyerInfo?.skipFiscalConfiguration) {
    await db.insert(invoiceSeries).values([
      { tenantId: tenant.id, legalEntityId: legalEntity.id, code: 'FS', fiscalYear: new Date().getFullYear(), documentType: 'SIMPLIFICADA' },
      { tenantId: tenant.id, legalEntityId: legalEntity.id, code: 'F', fiscalYear: new Date().getFullYear(), documentType: 'COMPLETA' },
      { tenantId: tenant.id, legalEntityId: legalEntity.id, code: 'FR', fiscalYear: new Date().getFullYear(), documentType: 'RECTIFICATIVA' },
    ]);
    await db.insert(productTaxProfiles).values({ tenantId: tenant.id, legalEntityId: legalEntity.id, selector: 'ebook-*', productNature: 'ebook', invoiceDescription: 'Libro electrónico', domesticTaxCode: 'ES_IVA_4', domesticTaxRate: '0.04', effectiveFrom: `${new Date().getFullYear()}-01-01` });
  }

  const [operation] = await db.insert(canonicalOperations).values({
    tenantId: tenant.id,
    legalEntityId: legalEntity.id,
    sourceChannel: 'shopify',
    sourceOrderId: 'ORDER-1',
    operationType: 'SALE',
    operationStatus: 'READY_FOR_INVOICING',
    reviewStatus: 'REVIEWED',
    reconciliationStatus: 'MATCHED',
    verifactuStatus: 'PENDING',
    customerAddress: buyerInfo?.customerAddress,
    customerEmail: buyerInfo?.customerEmail,
  }).returning({ id: canonicalOperations.id });
  if (!operation) {
  throw new Error('No se pudo crear la operación de prueba');
}

const [importJob] = await db
  .insert(importJobs)
  .values({
    tenantId: tenant.id,
    connectorId: 'shopify-order-transactions-test',
  })
  .returning({
    id: importJobs.id,
  });

if (!importJob) {
  throw new Error('No se pudo crear el trabajo de importación de prueba');
}

const [importFile] = await db
  .insert(importFiles)
  .values({
    tenantId: tenant.id,
    importJobId: importJob.id,
    storageKey: `tests/${slug}/shopify-order-transactions.csv`,
    originalNameEncrypted: `shopify-order-transactions-${slug}.csv`,
    mimeType: 'text/csv',
    byteSize: '1',
    sha256: `test-sha256-${slug}-shopify-transactions`,
    importerVersion: 'test',
  })
  .returning({
    id: importFiles.id,
  });

if (!importFile) {
  throw new Error('No se pudo crear el archivo de importación de prueba');
}

await db.insert(shopifyOrderPaymentEvents).values({
  tenantId: tenant.id,
  importFileId: importFile.id,
  externalEventKey: `${slug}:ORDER-1:sale:1`,
  shopifyOrderId: '1',
  shopifyOrderName: 'ORDER-1',
  kind: 'sale',
  gateway: 'shopify_payments',
  status: 'success',
  amount: '6.99',
  currency: 'EUR',
  occurredAt: new Date(),
});

  await db.insert(taxDecisions).values({
    tenantId: tenant.id,
    canonicalOperationId: operation.id,
    status: 'DETERMINADA',
    documentType: buyerInfo?.documentType ?? 'SIMPLIFICADA',
    taxBase: '6.72',
    taxRate: '0.04',
    taxAmount: '0.27',
    totalAmount: '6.99',
    explanation: {},
  });

  return { tenantId: tenant.id, actorId: actor.id, operationId: operation.id, legalEntityId: legalEntity.id };
}

async function getSeriesNextNumber(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  tenantId: string,
  documentType: string,
): Promise<number> {
  const [series] = await db
    .select({ nextNumber: invoiceSeries.nextNumber })
    .from(invoiceSeries)
    .where(and(
      eq(invoiceSeries.tenantId, tenantId),
      eq(invoiceSeries.documentType, documentType),
    ))
    .limit(1);

  if (!series) {
    throw new Error(`No existe serie ${documentType} para el tenant ${tenantId}`);
  }

  return Number(series.nextNumber);
}

async function getTenantFiscalDocuments(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  tenantId: string,
) {
  return db
    .select()
    .from(fiscalDocuments)
    .where(eq(fiscalDocuments.tenantId, tenantId));
}

async function getTenantIntegrityRecords(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  tenantId: string,
) {
  return db
    .select()
    .from(integrityChainRecords)
    .where(eq(integrityChainRecords.tenantId, tenantId));
}

async function getTenantVerifactuSubmissions(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  tenantId: string,
) {
  return db
    .select()
    .from(verifactuSubmissions)
    .where(eq(verifactuSubmissions.tenantId, tenantId));
}

async function seedAdditionalOperationWithDecision(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  input: {
    tenantId: string;
    legalEntityId: string;
    sourceOrderId: string;
    suffix: string;
  },
) {
  const [operation] = await db.insert(canonicalOperations).values({
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    sourceChannel: 'shopify',
    sourceOrderId: input.sourceOrderId,
    operationType: 'SALE',
    operationStatus: 'READY_FOR_INVOICING',
    reviewStatus: 'REVIEWED',
    reconciliationStatus: 'MATCHED',
    verifactuStatus: 'PENDING',
  }).returning({ id: canonicalOperations.id });

  if (!operation) {
    throw new Error('No se pudo crear la operación adicional de prueba');
  }

  const [importJob] = await db
    .insert(importJobs)
    .values({
      tenantId: input.tenantId,
      connectorId: `shopify-order-transactions-${input.suffix}`,
    })
    .returning({ id: importJobs.id });

  if (!importJob) {
    throw new Error('No se pudo crear el trabajo de importación adicional');
  }

  const [importFile] = await db
    .insert(importFiles)
    .values({
      tenantId: input.tenantId,
      importJobId: importJob.id,
      storageKey: `tests/${input.suffix}/shopify-order-transactions.csv`,
      originalNameEncrypted: `shopify-order-transactions-${input.suffix}.csv`,
      mimeType: 'text/csv',
      byteSize: '1',
      sha256: `test-sha256-${input.suffix}-shopify-transactions`,
      importerVersion: 'test',
    })
    .returning({ id: importFiles.id });

  if (!importFile) {
    throw new Error('No se pudo crear el archivo de importación adicional');
  }

  await db.insert(shopifyOrderPaymentEvents).values({
    tenantId: input.tenantId,
    importFileId: importFile.id,
    externalEventKey: `${input.suffix}:${input.sourceOrderId}:sale:1`,
    shopifyOrderId: input.sourceOrderId.replace(/[^0-9]/g, '') || input.suffix,
    shopifyOrderName: input.sourceOrderId,
    kind: 'sale',
    gateway: 'shopify_payments',
    status: 'success',
    amount: '6.99',
    currency: 'EUR',
    occurredAt: new Date(),
  });

  await db.insert(taxDecisions).values({
    tenantId: input.tenantId,
    canonicalOperationId: operation.id,
    status: 'DETERMINADA',
    documentType: 'SIMPLIFICADA',
    taxBase: '6.72',
    taxRate: '0.04',
    taxAmount: '0.27',
    totalAmount: '6.99',
    explanation: {},
  });

  return operation.id;
}

describe('DrizzleFiscalDocumentsRepository', () => {
  describe('issue', () => {
    it('bloquea la emisión cuando falta la configuración fiscal mínima', async () => {
      const { client, db } = createOfflineDatabase(); clients.push(client); await migrateOfflineDatabase(client);
      const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-incomplete', { skipFiscalConfiguration: true });
      const result = await new DrizzleFiscalDocumentsRepository(db).issue({ tenantId, actorId, canonicalOperationId: operationId, storage: new InMemoryStorage() });
      expect(result).toEqual({ ok: false, reason: 'FISCAL_CONFIGURATION_INCOMPLETE' });
    });
    it('emite una factura, escribe el PDF en storage y encadena el registro de integridad', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-a');
      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const result = await repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');

      expect(result.ok).toBe(true);
      expect(result.alreadyIssued).toBe(false);
      expect(result.document.documentType).toBe('SIMPLIFICADA');
      expect(result.document.number).toBe('FS-00001');
      expect(result.document.tenantId).toBe(tenantId);
      expect(storage.puts).toHaveLength(1);

      const chainRecords = await db.select().from(integrityChainRecords).where(eq(integrityChainRecords.tenantId, tenantId));
      expect(chainRecords).toHaveLength(1);
      expect(chainRecords[0]?.previousHash).toBeNull();
      expect(chainRecords[0]?.fiscalDocumentId).toBe(result.document.id);
      expect(chainRecords[0]?.legalEntityId).toBeTruthy();
      expect(chainRecords[0]?.softwareInstallationNumber).toBe('LOCAL-TEST-001');
      expect(chainRecords[0]?.aeatIdEmisorFactura).toBe('12345678Z');
      expect(chainRecords[0]?.aeatNumSerieFactura).toBe('FS-00001');
      expect(chainRecords[0]?.aeatFechaExpedicionFactura).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(chainRecords[0]?.aeatTipoFactura).toBe('F1');
      expect(chainRecords[0]?.aeatHuella).toMatch(/^[A-F0-9]{64}$/);
      expect(chainRecords[0]?.aeatPreviousHuella).toBeNull();
      expect(chainRecords[0]?.previousFiscalDocumentId).toBeNull();
      expect(chainRecords[0]?.chainStatus).toBe('FIRST_RECORD');
    });

    it('devuelve OPERATION_NOT_FOUND para una operación de otro tenant', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { operationId } = await seedOperationWithDecision(db, 'tenant-a');
      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const otherTenantId = '00000000-0000-0000-0000-000000000000';
      const result = await repository.issue({ tenantId: otherTenantId, actorId: otherTenantId, canonicalOperationId: operationId, storage });

      expect(result).toEqual({ ok: false, reason: 'OPERATION_NOT_FOUND' });
      expect(storage.puts).toHaveLength(0);
    });

    it('devuelve TAX_DECISION_MISSING cuando la operación no tiene decisión fiscal', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-a');
      // Remove the seeded decision to simulate an operation not yet tax-decided.
      await db.delete(taxDecisions).where(eq(taxDecisions.canonicalOperationId, operationId));
      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const result = await repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage });

      expect(result).toEqual({ ok: false, reason: 'TAX_DECISION_MISSING' });
      expect(storage.puts).toHaveLength(0);
    });

    it('bloquea la emisión cuando no existe un cobro Shopify confirmado', async () => {
  const { client, db } = createOfflineDatabase();
  clients.push(client);
  await migrateOfflineDatabase(client);

  const { tenantId, actorId, operationId } =
    await seedOperationWithDecision(db, 'tenant-sin-cobro-confirmado');

  await db
    .delete(shopifyOrderPaymentEvents)
    .where(eq(shopifyOrderPaymentEvents.tenantId, tenantId));

  const storage = new InMemoryStorage();

  const result = await new DrizzleFiscalDocumentsRepository(db).issue({
    tenantId,
    actorId,
    canonicalOperationId: operationId,
    storage,
  });

  expect(result).toEqual({
    ok: false,
    reason: 'COBRO_SHOPIFY_NO_CONFIRMADO',
  });

  expect(storage.puts).toHaveLength(0);
});


    it('no consume serie cuando la emisión queda bloqueada antes de emitir', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);

      const { tenantId, actorId, operationId } =
        await seedOperationWithDecision(db, 'tenant-bloqueo-no-consume-serie');

      await db
        .delete(shopifyOrderPaymentEvents)
        .where(eq(shopifyOrderPaymentEvents.tenantId, tenantId));

      const beforeNextNumber = await getSeriesNextNumber(db, tenantId, 'SIMPLIFICADA');
      const storage = new InMemoryStorage();

      const result = await new DrizzleFiscalDocumentsRepository(db).issue({
        tenantId,
        actorId,
        canonicalOperationId: operationId,
        storage,
      });

      expect(result).toEqual({
        ok: false,
        reason: 'COBRO_SHOPIFY_NO_CONFIRMADO',
      });

      expect(await getSeriesNextNumber(db, tenantId, 'SIMPLIFICADA')).toBe(beforeNextNumber);
      expect(await getTenantFiscalDocuments(db, tenantId)).toHaveLength(0);
      expect(await getTenantIntegrityRecords(db, tenantId)).toHaveLength(0);
      expect(storage.puts).toHaveLength(0);
    });

    it('es idempotente: emitir la misma operación dos veces devuelve el mismo documento y no duplica el registro de integridad', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-a');
      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const first = await repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage });
      const second = await repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected ok results');
      expect(second.document.id).toBe(first.document.id);
      expect(second.alreadyIssued).toBe(true);
      expect(storage.puts).toHaveLength(1);

      const chainRecords = await db.select().from(integrityChainRecords).where(eq(integrityChainRecords.tenantId, tenantId));
      expect(chainRecords).toHaveLength(1);
    });


    it('no consume un segundo número al emitir dos veces la misma operación', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);

      const { tenantId, actorId, operationId } =
        await seedOperationWithDecision(db, 'tenant-idempotencia-serie');

      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const first = await repository.issue({
        tenantId,
        actorId,
        canonicalOperationId: operationId,
        storage,
      });

      const second = await repository.issue({
        tenantId,
        actorId,
        canonicalOperationId: operationId,
        storage,
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected ok results');

      expect(first.document.number).toBe('FS-00001');
      expect(second.document.id).toBe(first.document.id);
      expect(second.alreadyIssued).toBe(true);
      expect(await getTenantFiscalDocuments(db, tenantId)).toHaveLength(1);
      expect(await getTenantIntegrityRecords(db, tenantId)).toHaveLength(1);
      expect(await getSeriesNextNumber(db, tenantId, 'SIMPLIFICADA')).toBe(2);
    });

    it('mantiene idempotencia básica cuando dos emisiones de la misma operación se solicitan en paralelo', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);

      const { tenantId, actorId, operationId } =
        await seedOperationWithDecision(db, 'tenant-concurrencia-misma-operacion');

      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const [first, second] = await Promise.all([
        repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage }),
        repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage }),
      ]);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected ok results');

      expect(second.document.id).toBe(first.document.id);
      expect(await getTenantFiscalDocuments(db, tenantId)).toHaveLength(1);
      expect(await getTenantIntegrityRecords(db, tenantId)).toHaveLength(1);
      expect(await getSeriesNextNumber(db, tenantId, 'SIMPLIFICADA')).toBe(2);
    });

    it('persiste encadenamiento oficial AEAT al emitir dos facturas secuenciales', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);

      const seeded = await seedOperationWithDecision(db, 'tenant-aeat-chain');
      const secondOperationId = await seedAdditionalOperationWithDecision(db, {
        tenantId: seeded.tenantId,
        legalEntityId: seeded.legalEntityId,
        sourceOrderId: 'ORDER-2',
        suffix: 'tenant-aeat-chain-2',
      });

      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const first = await repository.issue({
        tenantId: seeded.tenantId,
        actorId: seeded.actorId,
        canonicalOperationId: seeded.operationId,
        storage,
      });

      const second = await repository.issue({
        tenantId: seeded.tenantId,
        actorId: seeded.actorId,
        canonicalOperationId: secondOperationId,
        storage,
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected ok results');

      const chainRecords = await db
        .select()
        .from(integrityChainRecords)
        .where(eq(integrityChainRecords.tenantId, seeded.tenantId));

      expect(chainRecords).toHaveLength(2);

      const firstRecord = chainRecords.find((record) => record.fiscalDocumentId === first.document.id);
      const secondRecord = chainRecords.find((record) => record.fiscalDocumentId === second.document.id);

      expect(firstRecord?.chainStatus).toBe('FIRST_RECORD');
      expect(firstRecord?.aeatPreviousHuella).toBeNull();
      expect(firstRecord?.previousFiscalDocumentId).toBeNull();
      expect(firstRecord?.aeatHuella).toMatch(/^[A-F0-9]{64}$/);

      expect(secondRecord?.chainStatus).toBe('CHAINED');
      expect(secondRecord?.previousFiscalDocumentId).toBe(first.document.id);
      expect(secondRecord?.aeatPreviousHuella).toBe(firstRecord?.aeatHuella);
      expect(secondRecord?.aeatHuella).toMatch(/^[A-F0-9]{64}$/);
      expect(secondRecord?.aeatHuella).not.toBe(firstRecord?.aeatHuella);
    });

    it('asigna números únicos y secuenciales a operaciones distintas', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);

      const seeded = await seedOperationWithDecision(db, 'tenant-operaciones-distintas');
      const secondOperationId = await seedAdditionalOperationWithDecision(db, {
        tenantId: seeded.tenantId,
        legalEntityId: seeded.legalEntityId,
        sourceOrderId: 'ORDER-2',
        suffix: 'tenant-operaciones-distintas-2',
      });

      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const [first, second] = await Promise.all([
        repository.issue({
          tenantId: seeded.tenantId,
          actorId: seeded.actorId,
          canonicalOperationId: seeded.operationId,
          storage,
        }),
        repository.issue({
          tenantId: seeded.tenantId,
          actorId: seeded.actorId,
          canonicalOperationId: secondOperationId,
          storage,
        }),
      ]);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected ok results');

      const numbers = [first.document.number, second.document.number].sort();
      expect(numbers).toEqual(['FS-00001', 'FS-00002']);
      expect(await getTenantFiscalDocuments(db, seeded.tenantId)).toHaveLength(2);
      expect(await getTenantIntegrityRecords(db, seeded.tenantId)).toHaveLength(2);
      expect(await getSeriesNextNumber(db, seeded.tenantId, 'SIMPLIFICADA')).toBe(3);
    });

    it('acepta actorId null (emisión automática) y lo persiste correctamente en audit_events', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, operationId } = await seedOperationWithDecision(db, 'tenant-a');
      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const result = await repository.issue({ tenantId, actorId: null, canonicalOperationId: operationId, storage });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');

      const events = await db.select().from(auditEvents).where(eq(auditEvents.entityId, result.document.id));
      expect(events).toHaveLength(1);
      expect(events[0]?.actorId).toBeNull();
    });

    it('emite una factura simplificada aunque la operación contenga datos del comprador', async () => {
  const { client, db } = createOfflineDatabase();
  clients.push(client);
  await migrateOfflineDatabase(client);

  const { tenantId, actorId, operationId } =
    await seedOperationWithDecision(db, 'tenant-con-contacto', {
      customerAddress: 'Calle Ejemplo 1, Palma',
      customerEmail: 'cliente@ejemplo.com',
    });

  const repository = new DrizzleFiscalDocumentsRepository(db);
  const storage = new InMemoryStorage();

  const result = await repository.issue({
    tenantId,
    actorId,
    canonicalOperationId: operationId,
    storage,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected ok result');

  expect(result.document.documentType).toBe('SIMPLIFICADA');
  expect(result.document.renderSha256).toHaveLength(64);
  expect(storage.puts).toHaveLength(1);
});

    it('rechaza factura completa mientras el MVP sólo permite simplificadas', async () => {
  const { client, db } = createOfflineDatabase();
  clients.push(client);
  await migrateOfflineDatabase(client);

  const { tenantId, actorId, operationId } =
    await seedOperationWithDecision(db, 'tenant-completa', {
      documentType: 'COMPLETA',
    });

  const storage = new InMemoryStorage();
  const result = await new DrizzleFiscalDocumentsRepository(db).issue({
    tenantId,
    actorId,
    canonicalOperationId: operationId,
    storage,
  });

  expect(result).toEqual({
    ok: false,
    reason: 'DECISION_FISCAL_NO_EMITIBLE',
  });

  expect(storage.puts).toHaveLength(0);
    });

  });

  describe('rectify', () => {
    it('rectifica una factura emitida y encadena el registro de integridad sobre el existente', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-a');
      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const issued = await repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage });
      expect(issued.ok).toBe(true);
      if (!issued.ok) throw new Error('expected ok result');

      const result = await repository.rectify({ tenantId, actorId, fiscalDocumentId: issued.document.id, storage });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');
      expect(result.alreadyRectified).toBe(false);
      expect(result.document.documentType).toBe('RECTIFICATIVA');
      expect(result.document.number).toBe('FR-00001');
      expect(result.document.originalDocumentId).toBe(issued.document.id);
      expect(storage.puts).toHaveLength(2);

      const chainRecords = await db.select().from(integrityChainRecords).where(eq(integrityChainRecords.tenantId, tenantId));
      expect(chainRecords).toHaveLength(2);
      expect(chainRecords[1]?.previousHash).toBe(chainRecords[0]?.hash);
      expect(chainRecords[1]?.fiscalDocumentId).toBe(result.document.id);

      const documentsByRecord = [issued.document, result.document];
      const integrityRecords: IntegrityRecord[] = chainRecords.map((record, index) => {
        const document = documentsByRecord[index];
        if (!document) throw new Error('missing document for chain record');
        return {
          documentId: document.id,
          documentNumber: document.number,
          recordType: record.recordType as 'ALTA' | 'ANULACION',
          issuedAt: document.issuedAt.toISOString(),
          totalAmount: Number(document.totalAmount),
          taxAmount: Number(document.taxAmount),
          ...(record.previousHash ? { previousHash: record.previousHash } : {}),
          canonicalPayload: record.canonicalPayload,
          hash: record.hash,
          algorithm: record.algorithm as 'SHA-256',
          createdAt: record.createdAt.toISOString(),
        };
      });
      expect(verifyIntegrityChain(integrityRecords)).toBe(true);
    });

    it('bloquea la rectificación si falta configuración fiscal real del emisor', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);

      const { tenantId, actorId, operationId } =
        await seedOperationWithDecision(db, 'tenant-rectificacion-config-incompleta');

      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const issued = await repository.issue({
        tenantId,
        actorId,
        canonicalOperationId: operationId,
        storage,
      });

      expect(issued.ok).toBe(true);
      if (!issued.ok) throw new Error('expected ok result');

      await db
        .update(legalEntities)
        .set({ address: null })
        .where(eq(legalEntities.tenantId, tenantId));

      const beforeNextNumber = await getSeriesNextNumber(db, tenantId, 'RECTIFICATIVA');

      const result = await repository.rectify({
        tenantId,
        actorId,
        fiscalDocumentId: issued.document.id,
        storage,
      });

      expect(result).toEqual({
        ok: false,
        reason: 'CONFIGURACION_FISCAL_INCOMPLETA',
      });

      expect(await getSeriesNextNumber(db, tenantId, 'RECTIFICATIVA')).toBe(beforeNextNumber);
      expect(await getTenantFiscalDocuments(db, tenantId)).toHaveLength(1);
      expect(await getTenantIntegrityRecords(db, tenantId)).toHaveLength(1);
      expect(storage.puts).toHaveLength(1);
    });

    it('devuelve DOCUMENT_NOT_FOUND para un documento de otro tenant', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-a');
      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const issued = await repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage });
      if (!issued.ok) throw new Error('expected ok result');

      const otherTenantId = '00000000-0000-0000-0000-000000000000';
      const result = await repository.rectify({ tenantId: otherTenantId, actorId: otherTenantId, fiscalDocumentId: issued.document.id, storage });

      expect(result).toEqual({ ok: false, reason: 'DOCUMENT_NOT_FOUND' });
      expect(storage.puts).toHaveLength(1);
    });

    it('devuelve INVALID_DOCUMENT_STATE cuando el documento ya está rectificado', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-a');
      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const issued = await repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage });
      if (!issued.ok) throw new Error('expected ok result');

      const rectified = await repository.rectify({ tenantId, actorId, fiscalDocumentId: issued.document.id, storage });
      if (!rectified.ok) throw new Error('expected ok result');

      const result = await repository.rectify({ tenantId, actorId, fiscalDocumentId: rectified.document.id, storage });

      expect(result).toEqual({ ok: false, reason: 'INVALID_DOCUMENT_STATE' });
    });

    it('es idempotente: rectificar el mismo documento dos veces devuelve la misma rectificativa y no duplica el registro de integridad', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-a');
      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const issued = await repository.issue({ tenantId, actorId, canonicalOperationId: operationId, storage });
      if (!issued.ok) throw new Error('expected ok result');

      const first = await repository.rectify({ tenantId, actorId, fiscalDocumentId: issued.document.id, storage });
      const second = await repository.rectify({ tenantId, actorId, fiscalDocumentId: issued.document.id, storage });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected ok results');
      expect(second.document.id).toBe(first.document.id);
      expect(second.alreadyRectified).toBe(true);
      expect(storage.puts).toHaveLength(2);

      const chainRecords = await db.select().from(integrityChainRecords).where(eq(integrityChainRecords.tenantId, tenantId));
      expect(chainRecords).toHaveLength(2);
    });

    it('no consume un segundo número rectificativo al rectificar dos veces el mismo documento', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);

      const { tenantId, actorId, operationId } =
        await seedOperationWithDecision(db, 'tenant-rectificativa-idempotente-serie');

      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const issued = await repository.issue({
        tenantId,
        actorId,
        canonicalOperationId: operationId,
        storage,
      });

      expect(issued.ok).toBe(true);
      if (!issued.ok) throw new Error('expected ok result');

      const first = await repository.rectify({
        tenantId,
        actorId,
        fiscalDocumentId: issued.document.id,
        storage,
      });

      const second = await repository.rectify({
        tenantId,
        actorId,
        fiscalDocumentId: issued.document.id,
        storage,
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected ok results');

      expect(first.document.number).toBe('FR-00001');
      expect(second.document.id).toBe(first.document.id);
      expect(second.alreadyRectified).toBe(true);
      expect(await getTenantFiscalDocuments(db, tenantId)).toHaveLength(2);
      expect(await getTenantIntegrityRecords(db, tenantId)).toHaveLength(2);
      expect(await getSeriesNextNumber(db, tenantId, 'RECTIFICATIVA')).toBe(2);
    });

    it('mantiene idempotencia básica cuando dos rectificaciones del mismo documento se solicitan en paralelo', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);

      const { tenantId, actorId, operationId } =
        await seedOperationWithDecision(db, 'tenant-rectificativa-concurrente');

      const repository = new DrizzleFiscalDocumentsRepository(db);
      const storage = new InMemoryStorage();

      const issued = await repository.issue({
        tenantId,
        actorId,
        canonicalOperationId: operationId,
        storage,
      });

      expect(issued.ok).toBe(true);
      if (!issued.ok) throw new Error('expected ok result');

      const [first, second] = await Promise.all([
        repository.rectify({
          tenantId,
          actorId,
          fiscalDocumentId: issued.document.id,
          storage,
        }),
        repository.rectify({
          tenantId,
          actorId,
          fiscalDocumentId: issued.document.id,
          storage,
        }),
      ]);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('expected ok results');

      expect(second.document.id).toBe(first.document.id);
      expect(await getTenantFiscalDocuments(db, tenantId)).toHaveLength(2);
      expect(await getTenantIntegrityRecords(db, tenantId)).toHaveLength(2);
      expect(await getSeriesNextNumber(db, tenantId, 'RECTIFICATIVA')).toBe(2);
    });

  });
});


describe('VERI*FACTU submission drafts', () => {
  it('prepara un draft bloqueado por defecto al emitir una factura', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleFiscalDocumentsRepository(db);
    const storage = new InMemoryStorage();
    const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-verifactu-draft-disabled');

    const result = await repository.issue({
      tenantId,
      actorId,
      canonicalOperationId: operationId,
      storage,
    });

    expect(result.ok).toBe(true);

    const submissions = await getTenantVerifactuSubmissions(db, tenantId);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      tenantId,
      environment: 'mock',
      status: 'BLOCKED',
      responseRedacted: null,
    });
    expect(Number(submissions[0]?.attemptCount)).toBe(0);
    expect(submissions[0]?.payloadRedacted).toMatchObject({
      schemaVersion: 'anclora-verifactu-payload-redacted-v1',
      environment: 'mock',
      recordType: 'ALTA',
      documentNumber: result.ok ? result.document.number : undefined,
      algorithm: 'SHA-256',
    });
  });

  it('prepara un draft pendiente en modo mock explícito', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleFiscalDocumentsRepository(db);
    const storage = new InMemoryStorage();
    const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-verifactu-draft-mock');

    const result = await repository.issue({
      tenantId,
      actorId,
      canonicalOperationId: operationId,
      storage,
      verifactuConfig: resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
    });

    expect(result.ok).toBe(true);

    const submissions = await getTenantVerifactuSubmissions(db, tenantId);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      tenantId,
      environment: 'mock',
      status: 'PENDING',
      responseRedacted: null,
    });
  });

  it('no duplica el draft VERI*FACTU si la emisión se repite de forma idempotente', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleFiscalDocumentsRepository(db);
    const storage = new InMemoryStorage();
    const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-verifactu-draft-idempotente');

    const first = await repository.issue({
      tenantId,
      actorId,
      canonicalOperationId: operationId,
      storage,
      verifactuConfig: resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
    });

    const second = await repository.issue({
      tenantId,
      actorId,
      canonicalOperationId: operationId,
      storage,
      verifactuConfig: resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.document.id).toBe(first.document.id);
      expect(second.alreadyIssued).toBe(true);
    }

    expect(await getTenantIntegrityRecords(db, tenantId)).toHaveLength(1);
    expect(await getTenantVerifactuSubmissions(db, tenantId)).toHaveLength(1);
  });

  it('prepara un draft VERI*FACTU para rectificativas', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const repository = new DrizzleFiscalDocumentsRepository(db);
    const storage = new InMemoryStorage();
    const { tenantId, actorId, operationId } = await seedOperationWithDecision(db, 'tenant-verifactu-draft-rectificativa');

    const issued = await repository.issue({
      tenantId,
      actorId,
      canonicalOperationId: operationId,
      storage,
      verifactuConfig: resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
    });

    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const rectified = await repository.rectify({
      tenantId,
      actorId,
      fiscalDocumentId: issued.document.id,
      storage,
      verifactuConfig: resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
    });

    expect(rectified.ok).toBe(true);

    const submissions = await getTenantVerifactuSubmissions(db, tenantId);
    expect(submissions).toHaveLength(2);
    expect(submissions.map((submission) => submission.status)).toEqual(['PENDING', 'PENDING']);
    expect(submissions.map((submission) => (submission.payloadRedacted as { recordType: string }).recordType)).toEqual(['ALTA', 'ANULACION']);
  });
});
