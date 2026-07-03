import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('POST /api/v1/imports/preview persistence', () => {
  it('persiste el preview validado y expone el resultado idempotente', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../.evidence/payment_transactions_export_1.csv'));
    const persist = vi.fn().mockImplementation(async (_filename, preview) => ({ jobId: preview.jobId, duplicate: false }));
    const app = await buildApp({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      storage: {
        put: async (input) => ({
          key: `${input.tenantId}/evidence`,
          sha256: createHash('sha256').update(input.bytes).digest('hex'),
          size: input.bytes.byteLength,
          mimeType: input.mimeType,
        }),
        get: async () => new Uint8Array(),
      },
      importPreviewPersistence: { persist },
    });
    apps.push(app);
    const boundary = '----persistenceBoundary';
    const prefix = Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="transactions.csv"',
      'Content-Type: text/csv',
      '',
      '',
    ].join('\r\n'));
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'FISCAL_OPERATOR',
      },
      payload: Buffer.concat([prefix, bytes, suffix]),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'PREVIEW_READY', duplicate: false });
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith('transactions.csv', expect.objectContaining({ connector: 'shopify-csv' }));
  });
});
