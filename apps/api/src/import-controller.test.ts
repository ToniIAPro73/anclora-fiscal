import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('POST /api/v1/imports/preview persistence', () => {
  it('persiste el preview validado y expone el resultado idempotente', async () => {
    const bytes = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-ledger-charge-refund.csv'));
    const persist = vi.fn().mockImplementation(async (_tenantId, _filename, preview) => ({ jobId: preview.jobId, duplicate: false }));
    const app = await buildApp({
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
      authService: new AuthService({ authenticate: async () => ({
        actorId: '01977d43-75de-7000-8000-000000000020',
        tenantId: '01977d43-75de-7000-8000-000000000010',
        email: 'operator@example.test', displayName: 'Operador', role: 'FISCAL_OPERATOR',
      }) }, { record: async () => undefined }),
    });
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'operator@example.test', password: 'valid-password' } });
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '';
    const boundary = '----persistenceBoundary';
    const prefix = Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="connectorId"',
      '',
      'shopify-payments',
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
        cookie,
      },
      payload: Buffer.concat([prefix, bytes, suffix]),
    });

    // FASE 03: response status is now ANALYZED (was PREVIEW_READY) --
    // intentional breaking contract change, see plan Task 2.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ANALYZED', duplicate: false });
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'transactions.csv', expect.objectContaining({ connector: 'shopify-csv' }));
  });

  it('devuelve 400 CONNECTOR_ID_REQUIRED cuando falta connectorId', async () => {
    const app = await buildApp({
      storage: { put: async (input) => ({ key: `${input.tenantId}/evidence`, sha256: createHash('sha256').update(input.bytes).digest('hex'), size: input.bytes.byteLength, mimeType: input.mimeType }), get: async () => new Uint8Array() },
      authService: new AuthService({ authenticate: async () => ({
        actorId: '01977d43-75de-7000-8000-000000000020',
        tenantId: '01977d43-75de-7000-8000-000000000010',
        email: 'operator@example.test', displayName: 'Operador', role: 'FISCAL_OPERATOR',
      }) }, { record: async () => undefined }),
    });
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'operator@example.test', password: 'valid-password' } });
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '';
    const boundary = '----missingConnectorBoundary';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="orders.csv"',
      'Content-Type: text/csv',
      '',
      'Order,Refunded Amount\nAI-1001,0\n',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-anclora-role': 'FISCAL_OPERATOR', cookie },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'CONNECTOR_ID_REQUIRED' });
  });
});
