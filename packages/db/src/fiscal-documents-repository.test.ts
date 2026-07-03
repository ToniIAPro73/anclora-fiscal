import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { verifyIntegrityChain, type IntegrityRecord, type StoragePort, type StoredObject } from '@anclora/core/server';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleFiscalDocumentsRepository } from './fiscal-documents-repository';
import { canonicalOperations, integrityChainRecords, legalEntities, taxDecisions, tenants, users } from './schema';

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

async function seedOperationWithDecision(db: ReturnType<typeof createOfflineDatabase>['db'], slug: string) {
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
  }).returning({ id: canonicalOperations.id });
  if (!operation) throw new Error('No se pudo crear la operación de prueba');

  await db.insert(taxDecisions).values({
    tenantId: tenant.id,
    canonicalOperationId: operation.id,
    status: 'DECIDED',
    taxBase: '6.72',
    taxRate: '0.04',
    taxAmount: '0.27',
    totalAmount: '6.99',
    explanation: {},
  });

  return { tenantId: tenant.id, actorId: actor.id, operationId: operation.id };
}

describe('DrizzleFiscalDocumentsRepository', () => {
  describe('issue', () => {
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
      expect(result.alreadyIssued).toBe(false);
      expect(result.document.documentType).toBe('FULL_INVOICE');
      expect(result.document.tenantId).toBe(tenantId);
      expect(storage.puts).toHaveLength(1);

      const chainRecords = await db.select().from(integrityChainRecords).where(eq(integrityChainRecords.tenantId, tenantId));
      expect(chainRecords).toHaveLength(1);
      expect(chainRecords[0]?.previousHash).toBeNull();
      expect(chainRecords[0]?.fiscalDocumentId).toBe(result.document.id);
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
      expect(result.document.documentType).toBe('RECTIFYING_INVOICE');
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
  });
});
