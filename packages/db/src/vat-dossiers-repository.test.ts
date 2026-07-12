import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  encryptTaxIdentity,
  readVatDossierFile,
  readVatDossierJsonFile,
  verifyVatDossier,
  type StoragePort,
  type StoredObject,
} from '@anclora/core/server';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleFiscalDocumentsRepository } from './fiscal-documents-repository';
import { DrizzlePeriodClosesRepository } from './period-closes-repository';
import { DrizzleVatDossiersRepository } from './vat-dossiers-repository';
import {
  auditEvents,
  canonicalOperations,
  commercialOrders,
  importFiles,
  importJobs,
  invoiceSeries,
  legalEntities,
  productTaxProfiles,
  royaltyLines,
  royaltyStatements,
  shopifyOrderPaymentEvents,
  taxDecisions,
  tenants,
  users,
} from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(
    clients.splice(0).map((client) => client.close()),
  );
});

class InMemoryStorage implements StoragePort {
  puts: Array<{
    tenantId: string;
    bytes: Uint8Array;
    mimeType: string;
  }> = [];

  private readonly objects = new Map<string, Uint8Array>();

  async put(input: {
    tenantId: string;
    bytes: Uint8Array;
    mimeType: string;
  }): Promise<StoredObject> {
    this.puts.push(input);

    const key = `${input.tenantId}/${this.puts.length}`;

    this.objects.set(key, input.bytes);

    return {
      key,
      sha256: 'test-sha',
      size: input.bytes.byteLength,
      mimeType: input.mimeType,
    };
  }

  async get(key: string): Promise<Uint8Array> {
    const bytes = this.objects.get(key);

    if (!bytes) {
      throw new Error('not found');
    }

    return bytes;
  }
}

async function seedIssuedInvoice(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  slug: string,
) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: slug,
      slug,
    })
    .returning({
      id: tenants.id,
    });

  if (!tenant) {
    throw new Error('No se pudo crear el tenant de prueba');
  }

  const [actor] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      emailEncrypted: `${slug}-actor@example.test`,
      displayName: `${slug}-actor`,
      passwordHash: 'hash',
    })
    .returning({
      id: users.id,
    });

  if (!actor) {
    throw new Error('No se pudo crear el actor de prueba');
  }

  const [legalEntity] = await db
    .insert(legalEntities)
    .values({
  tenantId: tenant.id,
  legalName: `${slug} legal entity`,
  countryCode: 'ES',
  address: 'Calle Fiscal 1',
  taxIdentityEncrypted: encryptTaxIdentity('12345678Z'),
  taxIdentityConfigured: true,
  fiscalConfigurationStatus: 'COMPLETA',
  configurationStatus: 'READY',
})
    .returning({
      id: legalEntities.id,
    });

  if (!legalEntity) {
    throw new Error('No se pudo crear la entidad legal de prueba');
  }

  await db.insert(invoiceSeries).values({
    tenantId: tenant.id,
    legalEntityId: legalEntity.id,
    code: 'FS',
    fiscalYear: new Date().getFullYear(),
    documentType: 'SIMPLIFICADA',
  });

  await db.insert(productTaxProfiles).values({
    tenantId: tenant.id,
    legalEntityId: legalEntity.id,
    selector: 'ebook-*',
    productNature: 'ebook',
    invoiceDescription: 'Libro electrónico',
    domesticTaxCode: 'ES_IVA_4',
    domesticTaxRate: '0.04',
    effectiveFrom: `${new Date().getFullYear()}-01-01`,
  });

  const [operation] = await db
    .insert(canonicalOperations)
    .values({
      tenantId: tenant.id,
      legalEntityId: legalEntity.id,
      sourceChannel: 'shopify',
      sourceOrderId: 'ORDER-1',
      operationType: 'SALE',
      operationStatus: 'READY_FOR_INVOICING',
      reviewStatus: 'REVIEWED',
      reconciliationStatus: 'MATCHED',
      verifactuStatus: 'PENDING',
    })
    .returning({
      id: canonicalOperations.id,
    });

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
    throw new Error(
      'No se pudo crear el trabajo de importación de prueba',
    );
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
    throw new Error(
      'No se pudo crear el archivo de importación de prueba',
    );
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
    documentType: 'SIMPLIFICADA',
    taxBase: '6.72',
    taxRate: '0.04',
    taxAmount: '0.27',
    totalAmount: '6.99',
    explanation: {},
  });

  const invoiceStorage = new InMemoryStorage();

  const fiscalDocumentsRepository =
    new DrizzleFiscalDocumentsRepository(db);

  const issued = await fiscalDocumentsRepository.issue({
    tenantId: tenant.id,
    actorId: actor.id,
    canonicalOperationId: operation.id,
    storage: invoiceStorage,
  });

  if (!issued.ok) {
  throw new Error('No se pudo emitir la factura de prueba');
}

  return {
    tenantId: tenant.id,
    actorId: actor.id,
  };
}

const PERIOD = new Date().toISOString().slice(0, 7);

describe('DrizzleVatDossiersRepository', () => {
  describe('generate', () => {
    it('rechaza la generación cuando el período no está cerrado', async () => {
      const { client, db } = createOfflineDatabase();

      clients.push(client);

      await migrateOfflineDatabase(client);

      const { tenantId, actorId } = await seedIssuedInvoice(
        db,
        'tenant-a',
      );

      const repository = new DrizzleVatDossiersRepository(db);
      const storage = new InMemoryStorage();

      const result = await repository.generate({
        tenantId,
        period: PERIOD,
        actorId,
        storage,
      });

      expect(result).toEqual({
        ok: false,
        reason: 'PERIOD_NOT_CLOSED',
      });

      expect(storage.puts).toHaveLength(0);
    });

    it('genera el expediente para un período cerrado y produce un ZIP verificable', async () => {
      const { client, db } = createOfflineDatabase();

      clients.push(client);

      await migrateOfflineDatabase(client);

      const { tenantId, actorId } = await seedIssuedInvoice(
        db,
        'tenant-a',
      );

      const periodClosesRepository =
        new DrizzlePeriodClosesRepository(db);

      const closed = await periodClosesRepository.close(
        tenantId,
        PERIOD,
        actorId,
      );

      expect(closed.ok).toBe(true);

      const repository = new DrizzleVatDossiersRepository(db);
      const storage = new InMemoryStorage();

      const result = await repository.generate({
        tenantId,
        period: PERIOD,
        actorId,
        storage,
      });

      expect(result.ok).toBe(true);

      if (!result.ok) {
        throw new Error('expected ok result');
      }

      expect(result.alreadyGenerated).toBe(false);
      expect(result.dossier.status).toBe('CLOSED');
      expect(result.dossier.manifest['estado-verifactu.json']).toEqual(expect.any(String));
      expect(result.dossier.manifest['manifest.json']).toBeUndefined();
      expect(storage.puts).toHaveLength(1);

      const persistedBytes = await storage.get(
        result.dossier.storageKey,
      );

      expect(verifyVatDossier(persistedBytes)).toBe(true);

      const verifactuState = readVatDossierJsonFile<{
        schemaVersion: string;
        period: string;
        summary: Record<string, number>;
        records: Array<Record<string, unknown>>;
      }>(persistedBytes, 'estado-verifactu.json');

      if (!verifactuState) {
        throw new Error('No se encontró estado-verifactu.json');
      }

      expect(verifactuState).toMatchObject({
        schemaVersion: 'anclora-verifactu-state-v1',
        period: PERIOD,
        summary: { BLOCKED: 1 },
      });

      expect(verifactuState.records).toHaveLength(1);
      expect(verifactuState.records[0]).toMatchObject({
        environment: 'mock',
        status: 'BLOCKED',
        recordType: 'ALTA',
        attemptCount: 0,
        previousHash: null,
        responseReference: null,
        responseStatus: null,
        submittedAt: null,
      });
      expect(verifactuState.records[0]?.invoiceNumber).toEqual(expect.any(String));
      expect(verifactuState.records[0]?.issuedAt).toEqual(expect.any(String));
      expect(verifactuState.records[0]?.chainHash).toEqual(expect.any(String));

      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, tenantId));

      expect(
        events.filter(
          (event) => event.action === 'VAT_DOSSIER_GENERATED',
        ),
      ).toHaveLength(1);
    });

    it('es idempotente: regenerar sin force devuelve la misma fila sin volver a escribir en storage', async () => {
      const { client, db } = createOfflineDatabase();

      clients.push(client);

      await migrateOfflineDatabase(client);

      const { tenantId, actorId } = await seedIssuedInvoice(
        db,
        'tenant-a',
      );

      const periodClosesRepository =
        new DrizzlePeriodClosesRepository(db);

      await periodClosesRepository.close(
        tenantId,
        PERIOD,
        actorId,
      );

      const repository = new DrizzleVatDossiersRepository(db);
      const storage = new InMemoryStorage();

      const first = await repository.generate({
        tenantId,
        period: PERIOD,
        actorId,
        storage,
      });

      const second = await repository.generate({
        tenantId,
        period: PERIOD,
        actorId,
        storage,
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      if (!first.ok || !second.ok) {
        throw new Error('expected ok results');
      }

      expect(second.dossier.id).toBe(first.dossier.id);
      expect(second.alreadyGenerated).toBe(true);
      expect(storage.puts).toHaveLength(1);

      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, tenantId));

      expect(
        events.filter(
          (event) => event.action === 'VAT_DOSSIER_GENERATED',
        ),
      ).toHaveLength(1);
    });

    it('con force=true regenera el mismo expediente y registra un nuevo evento de auditoría', async () => {
      const { client, db } = createOfflineDatabase();

      clients.push(client);

      await migrateOfflineDatabase(client);

      const { tenantId, actorId } = await seedIssuedInvoice(
        db,
        'tenant-a',
      );

      const periodClosesRepository =
        new DrizzlePeriodClosesRepository(db);

      await periodClosesRepository.close(
        tenantId,
        PERIOD,
        actorId,
      );

      const repository = new DrizzleVatDossiersRepository(db);
      const storage = new InMemoryStorage();

      const first = await repository.generate({
        tenantId,
        period: PERIOD,
        actorId,
        storage,
      });

      if (!first.ok) {
        throw new Error('expected ok result');
      }

      const second = await repository.generate({
        tenantId,
        period: PERIOD,
        actorId,
        storage,
        force: true,
      });

      expect(second.ok).toBe(true);

      if (!second.ok) {
        throw new Error('expected ok result');
      }

      expect(second.alreadyGenerated).toBe(false);
      expect(second.dossier.id).toBe(first.dossier.id);
      expect(storage.puts).toHaveLength(2);

      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, tenantId));

      expect(
        events.filter(
          (event) => event.action === 'VAT_DOSSIER_GENERATED',
        ),
      ).toHaveLength(2);
    });
  });

  describe('get', () => {
    it('devuelve NOT_FOUND cuando no existe expediente para el período', async () => {
      const { client, db } = createOfflineDatabase();

      clients.push(client);

      await migrateOfflineDatabase(client);

      const { tenantId } = await seedIssuedInvoice(
        db,
        'tenant-a',
      );

      const repository = new DrizzleVatDossiersRepository(db);

      const result = await repository.get(tenantId, PERIOD);

      expect(result).toEqual({
        ok: false,
        reason: 'NOT_FOUND',
      });
    });

    it('devuelve el expediente persistido tras generarlo', async () => {
      const { client, db } = createOfflineDatabase();

      clients.push(client);

      await migrateOfflineDatabase(client);

      const { tenantId, actorId } = await seedIssuedInvoice(
        db,
        'tenant-a',
      );

      const periodClosesRepository =
        new DrizzlePeriodClosesRepository(db);

      await periodClosesRepository.close(
        tenantId,
        PERIOD,
        actorId,
      );

      const repository = new DrizzleVatDossiersRepository(db);
      const storage = new InMemoryStorage();

      const generated = await repository.generate({
        tenantId,
        period: PERIOD,
        actorId,
        storage,
      });

      if (!generated.ok) {
        throw new Error('expected ok result');
      }

      const result = await repository.get(tenantId, PERIOD);

      expect(result).toEqual({
        ok: true,
        dossier: generated.dossier,
      });
    });
  });

  describe('generate — regalías KDP y advertencias', () => {
    it('agrega regalías por formato y detecta advertencias OSS/B2B/reembolso', async () => {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);

      const { tenantId, actorId } = await seedIssuedInvoice(db, 'tenant-warnings');

      const [legalEntity] = await db
        .select({ id: legalEntities.id })
        .from(legalEntities)
        .where(eq(legalEntities.tenantId, tenantId))
        .limit(1);
      if (!legalEntity) throw new Error('No se encontró la entidad legal de prueba');

      await db.update(legalEntities).set({ ossEnabled: true }).where(eq(legalEntities.id, legalEntity.id));

      await db.insert(canonicalOperations).values([
        {
          tenantId,
          legalEntityId: legalEntity.id,
          sourceChannel: 'shopify',
          sourceOrderId: 'ORDER-OSS',
          operationType: 'SALE',
          operationStatus: 'READY_FOR_INVOICING',
          reviewStatus: 'REVIEWED',
          reconciliationStatus: 'MATCHED',
          verifactuStatus: 'PENDING',
          customerCountry: 'FR',
        },
        {
          tenantId,
          legalEntityId: legalEntity.id,
          sourceChannel: 'shopify',
          sourceOrderId: 'ORDER-B2B',
          operationType: 'SALE',
          operationStatus: 'READY_FOR_INVOICING',
          reviewStatus: 'REVIEWED',
          reconciliationStatus: 'MATCHED',
          verifactuStatus: 'PENDING',
          customerType: 'B2B',
        },
      ]);

      const [refundOrder] = await db.insert(commercialOrders).values({
        tenantId,
        sourceChannel: 'SHOPIFY',
        externalOrderId: 'ORDER-REFUND',
        commercialDate: new Date(),
        refundStatus: 'PARTIAL',
      }).returning({ id: commercialOrders.id });
      if (!refundOrder) throw new Error('No se pudo crear el pedido con reembolso');

      await db.insert(canonicalOperations).values({
        tenantId,
        legalEntityId: legalEntity.id,
        sourceChannel: 'SHOPIFY',
        sourceOrderId: 'ORDER-REFUND',
        operationType: 'SALE',
        operationStatus: 'READY_FOR_INVOICING',
        reviewStatus: 'REVIEWED',
        reconciliationStatus: 'MATCHED',
        verifactuStatus: 'PENDING',
      });

      const [royaltyStatement] = await db.insert(royaltyStatements).values({
        tenantId,
        importFileId: (await db.select({ id: importFiles.id }).from(importFiles).where(eq(importFiles.tenantId, tenantId)).limit(1))[0]!.id,
        sourceConnector: 'amazon-kdp-royalties',
        currency: 'EUR',
        periods: [PERIOD],
        totalRoyalties: '116.60',
        lineCount: '2',
        hash: 'test-royalty-hash-warnings',
      }).returning({ id: royaltyStatements.id });
      if (!royaltyStatement) throw new Error('No se pudo crear el estado de regalías de prueba');

      await db.insert(royaltyLines).values([
        {
          tenantId,
          royaltyStatementId: royaltyStatement.id,
          businessKey: 'royalty-ebook-1',
          classification: 'ebook',
          status: 'IMPORTED',
          period: PERIOD,
          isbnOrAsin: 'ASIN-1',
          unitsNet: '120',
          amount: '84.50',
          currency: 'EUR',
          sourceSheet: 'ebooks',
        },
        {
          tenantId,
          royaltyStatementId: royaltyStatement.id,
          businessKey: 'royalty-impreso-1',
          classification: 'impreso',
          status: 'IMPORTED',
          period: PERIOD,
          isbnOrAsin: 'ASIN-2',
          unitsNet: '8',
          amount: '32.10',
          currency: 'EUR',
          sourceSheet: 'impresos',
        },
      ]);

      const periodClosesRepository = new DrizzlePeriodClosesRepository(db);
      const closed = await periodClosesRepository.close(tenantId, PERIOD, actorId);
      expect(closed.ok).toBe(true);

      const repository = new DrizzleVatDossiersRepository(db);
      const storage = new InMemoryStorage();

      const result = await repository.generate({ tenantId, period: PERIOD, actorId, storage });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');

      const persistedBytes = await storage.get(result.dossier.storageKey);
      expect(verifyVatDossier(persistedBytes)).toBe(true);

      const royaltiesCsvBytes = readVatDossierFile(persistedBytes, 'regalias-kdp.csv');
      if (!royaltiesCsvBytes) throw new Error('No se encontró regalias-kdp.csv');
      const royaltiesCsv = new TextDecoder().decode(royaltiesCsvBytes);
      expect(royaltiesCsv).toContain('"ebook","120","84.50","EUR"');
      expect(royaltiesCsv).toContain('"impreso","8","32.10","EUR"');

      const warnings = readVatDossierJsonFile<{
        warnings: Array<{ type: string; orderId: string }>;
      }>(persistedBytes, 'advertencias.json');
      if (!warnings) throw new Error('No se encontró advertencias.json');

      expect(warnings.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'OSS', orderId: 'ORDER-OSS' }),
        expect.objectContaining({ type: 'B2B', orderId: 'ORDER-B2B' }),
        expect.objectContaining({ type: 'REFUND', orderId: 'ORDER-REFUND' }),
      ]));
    });
  });
});