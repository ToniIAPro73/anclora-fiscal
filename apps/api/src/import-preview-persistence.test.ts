import { describe, expect, it, vi } from 'vitest';
import { ImportMetadataCipher, ImportPreviewPersistenceService } from './import-preview-persistence';

describe('ImportPreviewPersistenceService', () => {
  it('cifra el nombre y delega todos los datos del preview al repositorio', async () => {
    const persist = vi.fn().mockResolvedValue({ jobId: 'job-1', duplicate: false });
    const service = new ImportPreviewPersistenceService(
      { persist },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
    );
    const preview = {
      jobId: 'job-1',
      status: 'PREVIEW_READY' as const,
      connector: 'shopify-csv' as const,
      evidence: { key: 'evidence/key', sha256: 'a'.repeat(64), size: 42, mimeType: 'text/csv' },
      summary: { records: 1, issues: 1, orderIds: ['#1'] },
      issues: [{ code: 'VAT_ZERO', severity: 'HIGH', message: 'Revisar IVA', row: 2 }],
    };

    await expect(service.persist('01977d43-75de-7000-8000-000000000010', 'clientes-2026.csv', preview)).resolves.toEqual({ jobId: 'job-1', duplicate: false });
    const persisted = persist.mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      jobId: 'job-1',
      connectorId: 'shopify-csv',
      importerVersion: 'shopify-csv@0.1.0',
      evidence: preview.evidence,
      issues: preview.issues,
    });
    expect(persisted.originalNameEncrypted).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(persisted.originalNameEncrypted).not.toContain('clientes-2026.csv');
  });
});
