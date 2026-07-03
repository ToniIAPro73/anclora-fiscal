import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FilesystemStorage } from '@anclora/core/server';
import { previewImport } from './import-service';

const root = resolve(import.meta.dirname, '../../../.tmp-import-test');
afterAll(() => rm(root, { recursive: true, force: true }));

describe('previewImport', () => {
  it('custodia evidencia y devuelve preview CSV sin PII', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../.evidence/payment_transactions_export_1.csv'));
    const result = await previewImport({ tenantId: 'test', filename: 'transactions.csv', mimeType: 'text/csv', bytes, storage: new FilesystemStorage(root) });
    expect(result.status).toBe('PREVIEW_READY');
    expect(result.summary).toMatchObject({ records: 2, orderIds: ['AI-1001'] });
    expect(result.evidence.sha256).toHaveLength(64);
    expect(JSON.stringify(result)).not.toContain('@');
  });

  it('detecta el XLSX de KDP por hoja conocida y devuelve la venta de 4 unidades pendiente de revisión KENP', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/kdp-orders-anonymized.xlsx'));
    const result = await previewImport({ tenantId: 'test', filename: 'KDP_Orders.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes, storage: new FilesystemStorage(root) });
    expect(result.status).toBe('PREVIEW_READY');
    expect(result.connector).toBe('kdp-xlsx');
    expect(result.summary.orderIds).toContain('9798184523026');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'KENP_PENDING_REVIEW' }));
  });

  it('no custodia contenido que falle la validación estructural', async () => {
    let writes = 0;
    await expect(previewImport({
      tenantId: 'test',
      filename: 'falso.csv',
      mimeType: 'text/csv',
      bytes: new TextEncoder().encode('contenido no CSV'),
      storage: {
        put: async () => { writes += 1; throw new Error('No debería escribirse'); },
        get: async () => new Uint8Array(),
      },
    })).rejects.toThrow();
    expect(writes).toBe(0);
  });
});
