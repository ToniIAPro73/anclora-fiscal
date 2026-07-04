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
});
