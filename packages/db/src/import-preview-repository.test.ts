import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { DrizzleImportPreviewRepository, ensureDevelopmentTenant } from './import-preview-repository';
import { migrateOfflineDatabase } from './migrations';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe('DrizzleImportPreviewRepository', () => {
  it('persiste preview, evidencia, incidencias y auditoría de forma idempotente', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await ensureDevelopmentTenant(db);
    const repository = new DrizzleImportPreviewRepository(db);
    const input = {
      tenantId,
      jobId: '01977d43-75de-7000-8000-000000000001',
      connectorId: 'shopify-csv',
      importerVersion: 'shopify-csv@0.1.0',
      originalNameEncrypted: 'v1:ciphertext',
      evidence: {
        key: `${tenantId}/evidence`,
        sha256: 'a'.repeat(64),
        size: 128,
        mimeType: 'text/csv',
      },
      summary: { records: 2, issues: 1, orderIds: ['AI-1001'] },
      issues: [{ code: 'VAT_ZERO', severity: 'HIGH', message: 'Revisión fiscal necesaria' }],
    };

    const first = await repository.persist(input);
    const second = await repository.persist({ ...input, jobId: '01977d43-75de-7000-8000-000000000002' });
    const counts = await client.query<{ table_name: string; count: number }>(`
      SELECT 'import_jobs' AS table_name, count(*)::int AS count FROM import_jobs
      UNION ALL SELECT 'import_files', count(*)::int FROM import_files
      UNION ALL SELECT 'evidence_documents', count(*)::int FROM evidence_documents
      UNION ALL SELECT 'import_errors', count(*)::int FROM import_errors
      UNION ALL SELECT 'audit_events', count(*)::int FROM audit_events
    `);

    expect(first).toMatchObject({ jobId: input.jobId, duplicate: false });
    expect(second).toMatchObject({ jobId: input.jobId, duplicate: true });
    expect(second.importFileId).toBe(first.importFileId);
    expect(counts.rows).toEqual([
      { table_name: 'import_jobs', count: 1 },
      { table_name: 'import_files', count: 1 },
      { table_name: 'evidence_documents', count: 1 },
      { table_name: 'import_errors', count: 1 },
      { table_name: 'audit_events', count: 1 },
    ]);
  });

  it('persiste con el nuevo estado ANALYZED (FASE 03), no PREVIEW_READY', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await ensureDevelopmentTenant(db);
    const repository = new DrizzleImportPreviewRepository(db);
    const result = await repository.persist({
      tenantId,
      jobId: '01977d43-75de-7000-8000-000000000003',
      connectorId: 'shopify-orders-csv',
      importerVersion: 'shopify-orders-csv@0.1.0',
      originalNameEncrypted: 'v1:ciphertext',
      evidence: { key: `${tenantId}/evidence`, sha256: 'e'.repeat(64), size: 64, mimeType: 'text/csv' },
      summary: { records: 1, issues: 0, orderIds: ['AI-1'] },
      issues: [],
    });
    const job = await repository.findJob(tenantId, result.jobId);
    expect(job?.status).toBe('ANALYZED');
  });

  describe('confirm/reject/retry (FASE 03 lifecycle)', () => {
    async function seedJob(overrides: { severity?: string } = {}) {
      const { client, db } = createOfflineDatabase();
      clients.push(client);
      await migrateOfflineDatabase(client);
      const tenantId = await ensureDevelopmentTenant(db);
      const repository = new DrizzleImportPreviewRepository(db);
      const jobId = '01977d43-75de-7000-8000-000000000009';
      await repository.persist({
        tenantId,
        jobId,
        connectorId: 'shopify-orders-csv',
        importerVersion: 'shopify-orders-csv@0.1.0',
        originalNameEncrypted: 'v1:ciphertext',
        evidence: { key: `${tenantId}/evidence`, sha256: 'f'.repeat(64), size: 64, mimeType: 'text/csv' },
        summary: { records: 1, issues: 1, orderIds: ['AI-1'] },
        issues: [{ code: 'ORDER_TOTAL_MISMATCH', severity: overrides.severity ?? 'BLOCKING', message: 'Total no coincide' }],
      });
      return { db, client, tenantId, jobId, repository };
    }

    it('findJob y listIssues devuelven el estado e incidencias persistidas', async () => {
      const { tenantId, jobId, repository } = await seedJob();
      const job = await repository.findJob(tenantId, jobId);
      expect(job).toMatchObject({ id: jobId, status: 'ANALYZED', connectorId: 'shopify-orders-csv' });
      const issues = await repository.listIssues(tenantId, jobId);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ code: 'ORDER_TOTAL_MISMATCH', blocking: true });
    });

    it('confirm transiciona el estado y registra un evento de auditoría', async () => {
      const { tenantId, jobId, repository, client } = await seedJob();
      await repository.confirm(tenantId, jobId, 'IMPORTED_WITH_ISSUES');
      const job = await repository.findJob(tenantId, jobId);
      expect(job?.status).toBe('IMPORTED_WITH_ISSUES');
      const audit = await client.query<{ action: string }>(`SELECT action FROM audit_events WHERE entity_id = '${jobId}'`);
      expect(audit.rows.map((row) => row.action)).toContain('IMPORT_JOB_CONFIRMED');
    });

    it('reject transiciona a REJECTED y conserva import_files/evidence_documents', async () => {
      const { tenantId, jobId, repository, client } = await seedJob();
      await repository.reject(tenantId, jobId, 'Datos incorrectos');
      const job = await repository.findJob(tenantId, jobId);
      expect(job?.status).toBe('REJECTED');
      const counts = await client.query<{ table_name: string; count: number }>(`
        SELECT 'import_files' AS table_name, count(*)::int AS count FROM import_files
        UNION ALL SELECT 'evidence_documents', count(*)::int FROM evidence_documents
      `);
      expect(counts.rows).toEqual([
        { table_name: 'import_files', count: 1 },
        { table_name: 'evidence_documents', count: 1 },
      ]);
    });

    // FASE 03 regression: a preview/analysis (repository.persist(), called by
    // seedJob() above) must never create commercial_orders/financial_events
    // rows -- only ImportPreviewPersistenceService.persistFiscalRecords does,
    // and only from confirm time. Rejecting an analyzed-but-not-confirmed job
    // must therefore leave zero rows in both tables, with nothing to roll back.
    it('reject deja cero pedidos comerciales y eventos financieros tras un preview (nunca existieron)', async () => {
      const { tenantId, jobId, repository, client } = await seedJob();
      await repository.reject(tenantId, jobId, 'Datos incorrectos');
      const counts = await client.query<{ table_name: string; count: number }>(`
        SELECT 'commercial_orders' AS table_name, count(*)::int AS count FROM commercial_orders WHERE tenant_id = '${tenantId}'
        UNION ALL SELECT 'financial_events', count(*)::int FROM financial_events WHERE tenant_id = '${tenantId}'
      `);
      expect(counts.rows).toEqual([
        { table_name: 'commercial_orders', count: 0 },
        { table_name: 'financial_events', count: 0 },
      ]);
    });

    it('recordRetry reemplaza incidencias, actualiza estado y no duplica import_jobs', async () => {
      const { tenantId, jobId, repository, client } = await seedJob();
      await repository.recordRetry({
        tenantId,
        jobId,
        actorId: '01977d43-75de-7000-8000-000000000020',
        reason: 'Reintento manual tras corregir el mapeo',
        status: 'ANALYZED',
        summary: { records: 1, issues: 0, orderIds: ['AI-1'] },
        issues: [],
      });
      const job = await repository.findJob(tenantId, jobId);
      expect(job?.status).toBe('ANALYZED');
      expect((job?.summary as { retryHistory?: unknown[] })?.retryHistory).toHaveLength(1);
      const issues = await repository.listIssues(tenantId, jobId);
      expect(issues).toHaveLength(0);
      const jobsCount = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM import_jobs');
      expect(jobsCount.rows[0]?.count).toBe(1);
    });
  });
});
