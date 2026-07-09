import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleVerifactuSubmissionsRepository } from './verifactu-submissions-repository';
import { and, eq } from 'drizzle-orm';
import {
  canonicalOperations,
  fiscalDocuments,
  integrityChainRecords,
  legalEntities,
  tenants,
  verifactuSubmissionAttempts,
  verifactuSubmissions,
} from './schema';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedSubmission(
  db: ReturnType<typeof createOfflineDatabase>['db'],
  input: {
    slug: string;
    environment?: string;
    status?: string;
    sourceOrderId?: string;
    attemptCount?: string;
  },
) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: input.slug, slug: input.slug })
    .returning({ id: tenants.id });

  if (!tenant) throw new Error('No se pudo crear el tenant');

  const [legalEntity] = await db
    .insert(legalEntities)
    .values({
      tenantId: tenant.id,
      legalName: `${input.slug} legal entity`,
      countryCode: 'ES',
      address: 'Calle Fiscal 1',
      configurationStatus: 'READY',
    })
    .returning({ id: legalEntities.id });

  if (!legalEntity) throw new Error('No se pudo crear la entidad legal');

  const [operation] = await db
    .insert(canonicalOperations)
    .values({
      tenantId: tenant.id,
      legalEntityId: legalEntity.id,
      sourceChannel: 'shopify',
      sourceOrderId: input.sourceOrderId ?? `${input.slug}-ORDER-1`,
      operationType: 'SALE',
      operationStatus: 'READY_FOR_INVOICING',
      reviewStatus: 'REVIEWED',
      reconciliationStatus: 'MATCHED',
      verifactuStatus: 'PENDING',
    })
    .returning({ id: canonicalOperations.id });

  if (!operation) throw new Error('No se pudo crear la operación');

  const [document] = await db
    .insert(fiscalDocuments)
    .values({
      tenantId: tenant.id,
      canonicalOperationId: operation.id,
      number: `${input.slug}-FS-1`,
      documentType: 'SIMPLIFICADA',
      status: 'ISSUED',
      issuedAt: new Date('2026-07-09T00:00:00.000Z'),
      taxBase: '6.72',
      taxAmount: '0.27',
      totalAmount: '6.99',
      currency: 'EUR',
      renderStorageKey: `${input.slug}/invoice.pdf`,
      renderSha256: `${input.slug}-render-sha`,
    })
    .returning({ id: fiscalDocuments.id, number: fiscalDocuments.number });

  if (!document) throw new Error('No se pudo crear el documento fiscal');

  const [integrityRecord] = await db
    .insert(integrityChainRecords)
    .values({
      tenantId: tenant.id,
      fiscalDocumentId: document.id,
      recordType: 'ALTA',
      canonicalPayload: '{}',
      hash: `${input.slug}-chain-hash`,
      algorithm: 'SHA-256',
    })
    .returning({ id: integrityChainRecords.id });

  if (!integrityRecord) throw new Error('No se pudo crear el registro de integridad');

  const [submission] = await db
    .insert(verifactuSubmissions)
    .values({
      tenantId: tenant.id,
      integrityRecordId: integrityRecord.id,
      environment: input.environment ?? 'mock',
      status: input.status ?? 'PENDING',
      payloadRedacted: {
        schemaVersion: 'anclora-verifactu-payload-redacted-v1',
        documentNumber: document.number,
      },
      responseRedacted: null,
      attemptCount: input.attemptCount ?? '0',
    })
    .returning({ id: verifactuSubmissions.id });

  if (!submission) throw new Error('No se pudo crear el submission VERI*FACTU');

  return { tenantId: tenant.id, documentNumber: document.number, submissionId: submission.id };
}

describe('DrizzleVerifactuSubmissionsRepository', () => {
  it('lista submissions tenant-scoped con datos del documento fiscal y cadena', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-list',
      environment: 'mock',
      status: 'PENDING',
    });
    await seedSubmission(db, {
      slug: 'tenant-verifactu-other',
      environment: 'mock',
      status: 'PENDING',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    const result = await repository.list({
      tenantId: seeded.tenantId,
      page: 1,
      pageSize: 25,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      tenantId: seeded.tenantId,
      environment: 'mock',
      status: 'PENDING',
      fiscalDocumentNumber: seeded.documentNumber,
      documentType: 'SIMPLIFICADA',
      recordType: 'ALTA',
      chainHash: 'tenant-verifactu-list-chain-hash',
      previousHash: null,
      attemptCount: '0',
    });
  });

  it('filtra por status y environment', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const first = await seedSubmission(db, {
      slug: 'tenant-verifactu-filter',
      environment: 'mock',
      status: 'PENDING',
      sourceOrderId: 'ORDER-1',
    });

    await seedSubmission(db, {
      slug: 'tenant-verifactu-filter-second',
      environment: 'test',
      status: 'BLOCKED',
      sourceOrderId: 'ORDER-2',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    const result = await repository.list({
      tenantId: first.tenantId,
      page: 1,
      pageSize: 25,
      status: 'PENDING',
      environment: 'mock',
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      tenantId: first.tenantId,
      environment: 'mock',
      status: 'PENDING',
    });
  });
});


describe('DrizzleVerifactuSubmissionsRepository applyAttemptOutcome', () => {
  it('aplica un outcome aceptado sólo sobre submissions PENDING del tenant', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-apply-accepted',
      environment: 'test',
      status: 'PENDING',
      attemptCount: '0',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    const updated = await repository.applyAttemptOutcome({
      tenantId: seeded.tenantId,
      submissionId: seeded.submissionId,
      outcome: {
        status: 'ACCEPTED',
        responseRedacted: {
          schemaVersion: 'anclora-verifactu-response-redacted-v1',
          environment: 'test',
          status: 'ACCEPTED',
          reference: 'aeat-ref-1',
          message: 'Aceptado en entorno de pruebas',
          submittedAt: '2026-07-09T10:00:00.000Z',
        },
        attemptCountIncrement: 1,
      },
    });

    expect(updated).toMatchObject({
      id: seeded.submissionId,
      tenantId: seeded.tenantId,
      environment: 'test',
      status: 'ACCEPTED',
      attemptCount: '1',
      fiscalDocumentNumber: seeded.documentNumber,
    });

    expect(updated?.responseRedacted).toMatchObject({
      schemaVersion: 'anclora-verifactu-response-redacted-v1',
      environment: 'test',
      status: 'ACCEPTED',
      reference: 'aeat-ref-1',
      message: 'Aceptado en entorno de pruebas',
    });
  });

  it('incrementa attemptCount conservando el contador previo', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-apply-retry',
      environment: 'test',
      status: 'PENDING',
      attemptCount: '2',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    const updated = await repository.applyAttemptOutcome({
      tenantId: seeded.tenantId,
      submissionId: seeded.submissionId,
      outcome: {
        status: 'TECHNICAL_ERROR',
        responseRedacted: {
          schemaVersion: 'anclora-verifactu-response-redacted-v1',
          environment: 'test',
          status: 'TECHNICAL_ERROR',
          reference: null,
          message: 'SOAP_TIMEOUT',
          submittedAt: '2026-07-09T10:00:00.000Z',
        },
        attemptCountIncrement: 1,
      },
    });

    expect(updated).toMatchObject({
      id: seeded.submissionId,
      status: 'TECHNICAL_ERROR',
      attemptCount: '3',
    });
  });

  it('no actualiza submissions que no pertenecen al tenant', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-apply-cross-tenant',
      environment: 'test',
      status: 'PENDING',
    });

    const other = await seedSubmission(db, {
      slug: 'tenant-verifactu-apply-cross-tenant-other',
      environment: 'test',
      status: 'PENDING',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    const updated = await repository.applyAttemptOutcome({
      tenantId: other.tenantId,
      submissionId: seeded.submissionId,
      outcome: {
        status: 'ACCEPTED',
        responseRedacted: {
          schemaVersion: 'anclora-verifactu-response-redacted-v1',
          environment: 'test',
          status: 'ACCEPTED',
          reference: 'aeat-ref-cross',
          message: 'No debería aplicarse',
          submittedAt: '2026-07-09T10:00:00.000Z',
        },
        attemptCountIncrement: 1,
      },
    });

    expect(updated).toBeNull();

    const original = await repository.list({
      tenantId: seeded.tenantId,
      page: 1,
      pageSize: 25,
    });

    expect(original.items[0]).toMatchObject({
      id: seeded.submissionId,
      status: 'PENDING',
      attemptCount: '0',
      responseRedacted: null,
    });
  });

  it('no reescribe submissions que ya no están PENDING', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-apply-not-pending',
      environment: 'test',
      status: 'ACCEPTED',
      attemptCount: '1',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    const updated = await repository.applyAttemptOutcome({
      tenantId: seeded.tenantId,
      submissionId: seeded.submissionId,
      outcome: {
        status: 'REJECTED',
        responseRedacted: {
          schemaVersion: 'anclora-verifactu-response-redacted-v1',
          environment: 'test',
          status: 'REJECTED',
          reference: 'aeat-ref-rejected',
          message: 'No debería sobrescribir',
          submittedAt: '2026-07-09T10:00:00.000Z',
        },
        attemptCountIncrement: 1,
      },
    });

    expect(updated).toBeNull();

    const current = await repository.list({
      tenantId: seeded.tenantId,
      page: 1,
      pageSize: 25,
    });

    expect(current.items[0]).toMatchObject({
      id: seeded.submissionId,
      status: 'ACCEPTED',
      attemptCount: '1',
      responseRedacted: null,
    });
  });
});



  it('registra cada outcome aplicado como intento auditable', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-attempt-audit',
      environment: 'test',
      status: 'PENDING',
      attemptCount: '2',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    const updated = await repository.applyAttemptOutcome({
      tenantId: seeded.tenantId,
      submissionId: seeded.submissionId,
      outcome: {
        status: 'TECHNICAL_ERROR',
        responseRedacted: {
          schemaVersion: 'anclora-verifactu-response-redacted-v1',
          environment: 'test',
          status: 'TECHNICAL_ERROR',
          reference: null,
          message: 'Timeout AEAT pruebas',
          submittedAt: '2026-07-09T12:30:00.000Z',
        },
        attemptCountIncrement: 1,
      },
    });

    expect(updated).toMatchObject({
      id: seeded.submissionId,
      status: 'TECHNICAL_ERROR',
      attemptCount: '3',
    });

    const attempts = await db
      .select()
      .from(verifactuSubmissionAttempts)
      .where(and(
        eq(verifactuSubmissionAttempts.tenantId, seeded.tenantId),
        eq(verifactuSubmissionAttempts.verifactuSubmissionId, seeded.submissionId),
      ));

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      tenantId: seeded.tenantId,
      verifactuSubmissionId: seeded.submissionId,
      attemptNumber: '3',
      status: 'TECHNICAL_ERROR',
    });
    expect(attempts[0]?.attemptedAt.toISOString()).toBe('2026-07-09T12:30:00.000Z');
    expect(attempts[0]?.responseRedacted).toMatchObject({
      schemaVersion: 'anclora-verifactu-response-redacted-v1',
      environment: 'test',
      status: 'TECHNICAL_ERROR',
      reference: null,
      message: 'Timeout AEAT pruebas',
    });
  });

  it('no registra intentos cuando el outcome no puede aplicarse por tenant o estado', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-attempt-not-pending',
      environment: 'test',
      status: 'ACCEPTED',
      attemptCount: '1',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    const updated = await repository.applyAttemptOutcome({
      tenantId: seeded.tenantId,
      submissionId: seeded.submissionId,
      outcome: {
        status: 'REJECTED',
        responseRedacted: {
          schemaVersion: 'anclora-verifactu-response-redacted-v1',
          environment: 'test',
          status: 'REJECTED',
          reference: 'aeat-ref-rejected',
          message: 'Rechazado',
          submittedAt: '2026-07-09T13:00:00.000Z',
        },
        attemptCountIncrement: 1,
      },
    });

    expect(updated).toBeNull();

    const attempts = await db
      .select()
      .from(verifactuSubmissionAttempts)
      .where(eq(verifactuSubmissionAttempts.tenantId, seeded.tenantId));

    expect(attempts).toHaveLength(0);
  });


describe('DrizzleVerifactuSubmissionsRepository listAttempts', () => {
  it('lista intentos tenant-scoped de una submission', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-list-attempts',
      environment: 'test',
      status: 'PENDING',
      attemptCount: '0',
    });

    const other = await seedSubmission(db, {
      slug: 'tenant-verifactu-list-attempts-other',
      environment: 'test',
      status: 'PENDING',
      attemptCount: '0',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    await repository.applyAttemptOutcome({
      tenantId: seeded.tenantId,
      submissionId: seeded.submissionId,
      outcome: {
        status: 'ACCEPTED',
        responseRedacted: {
          schemaVersion: 'anclora-verifactu-response-redacted-v1',
          environment: 'test',
          status: 'ACCEPTED',
          reference: 'aeat-visible-history',
          message: 'Aceptado para auditoría visible',
          submittedAt: '2026-07-09T14:00:00.000Z',
        },
        attemptCountIncrement: 1,
      },
    });

    const attempts = await repository.listAttempts({
      tenantId: seeded.tenantId,
      submissionId: seeded.submissionId,
    });

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      tenantId: seeded.tenantId,
      verifactuSubmissionId: seeded.submissionId,
      attemptNumber: '1',
      status: 'ACCEPTED',
    });
    expect(attempts[0]?.attemptedAt.toISOString()).toBe('2026-07-09T14:00:00.000Z');
    expect(attempts[0]?.responseRedacted).toMatchObject({
      reference: 'aeat-visible-history',
      message: 'Aceptado para auditoría visible',
    });

    await expect(repository.listAttempts({
      tenantId: other.tenantId,
      submissionId: seeded.submissionId,
    })).resolves.toHaveLength(0);
  });
});

describe('DrizzleVerifactuSubmissionsRepository findPendingById para ejecución interna', () => {
  it('devuelve una submission PENDING del tenant con payload redacted y fiscalDocumentId', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-find-pending',
      environment: 'test',
      status: 'PENDING',
      attemptCount: '2',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    const pending = await repository.findPendingById({
      tenantId: seeded.tenantId,
      submissionId: seeded.submissionId,
    });

    expect(pending).toMatchObject({
      id: seeded.submissionId,
      tenantId: seeded.tenantId,
      status: 'PENDING',
      environment: 'test',
      attemptCount: '2',
    });

    expect(pending?.fiscalDocumentId).toEqual(expect.any(String));
    expect(pending?.payloadRedacted).toMatchObject({
      schemaVersion: 'anclora-verifactu-payload-redacted-v1',
      environment: 'test',
      documentNumber: seeded.documentNumber,
    });
  });

  it('devuelve null para submissions de otro tenant', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-find-cross',
      environment: 'test',
      status: 'PENDING',
    });

    const other = await seedSubmission(db, {
      slug: 'tenant-verifactu-find-cross-other',
      environment: 'test',
      status: 'PENDING',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    await expect(
      repository.findPendingById({
        tenantId: other.tenantId,
        submissionId: seeded.submissionId,
      }),
    ).resolves.toBeNull();
  });

  it('devuelve null para submissions que ya no están PENDING', async () => {
    const { db, client } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);

    const seeded = await seedSubmission(db, {
      slug: 'tenant-verifactu-find-not-pending',
      environment: 'test',
      status: 'ACCEPTED',
    });

    const repository = new DrizzleVerifactuSubmissionsRepository(db);

    await expect(
      repository.findPendingById({
        tenantId: seeded.tenantId,
        submissionId: seeded.submissionId,
      }),
    ).resolves.toBeNull();
  });
});
