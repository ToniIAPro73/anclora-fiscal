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

  it('persiste las líneas de regalías cuando el preview incluye datos KDP', async () => {
    const persist = vi.fn().mockResolvedValue({ jobId: 'job-2', importFileId: 'file-2', duplicate: false });
    const royaltyPersist = vi.fn().mockResolvedValue({ statementId: 'stmt-1', duplicate: false });
    const service = new ImportPreviewPersistenceService(
      { persist },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      { persist: royaltyPersist },
    );
    const statement = { hash: 'b'.repeat(64), sourceConnector: 'kdp' as const, currency: 'EUR', periods: ['2026-06'], totalRoyalties: 6.99, lineCount: 1 };
    const lines = [{ businessKey: 'k1', classification: 'ebook' as const, status: 'RECOGNIZED' as const, period: '2026-06', isbnOrAsin: 'B1', amount: 6.99, currency: 'EUR', sourceSheet: 'Regalías de eBooks' }];
    const preview = {
      jobId: 'job-2',
      status: 'PREVIEW_READY' as const,
      connector: 'kdp-xlsx' as const,
      evidence: { key: 'evidence/key', sha256: 'c'.repeat(64), size: 42, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      summary: { records: 1, issues: 0, orderIds: ['B1'] },
      issues: [],
      royalty: { statement, lines },
    };

    await service.persist('01977d43-75de-7000-8000-000000000010', 'kdp.xlsx', preview);
    expect(royaltyPersist).toHaveBeenCalledWith({ tenantId: '01977d43-75de-7000-8000-000000000010', importFileId: 'file-2', statement, lines });
  });

  it('no persiste líneas de regalías cuando el archivo ya estaba registrado (duplicate)', async () => {
    const persist = vi.fn().mockResolvedValue({ jobId: 'job-3', importFileId: 'file-3', duplicate: true });
    const royaltyPersist = vi.fn();
    const service = new ImportPreviewPersistenceService(
      { persist },
      new ImportMetadataCipher('a-secure-test-secret-with-32-characters'),
      { persist: royaltyPersist },
    );
    const preview = {
      jobId: 'job-3',
      status: 'PREVIEW_READY' as const,
      connector: 'kdp-xlsx' as const,
      evidence: { key: 'evidence/key', sha256: 'd'.repeat(64), size: 42, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      summary: { records: 1, issues: 0, orderIds: ['B1'] },
      issues: [],
      royalty: { statement: { hash: 'd'.repeat(64), sourceConnector: 'kdp' as const, currency: 'EUR', periods: ['2026-06'], totalRoyalties: 6.99, lineCount: 1 }, lines: [] },
    };

    await service.persist('01977d43-75de-7000-8000-000000000010', 'kdp.xlsx', preview);
    expect(royaltyPersist).not.toHaveBeenCalled();
  });
});
