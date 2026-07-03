import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const CSV_BODY = 'Order,Refunded Amount\nAI-1001,0\n';

function multipartCsvBody(boundary: string, filename: string, mimeType: string, content: string) {
  return [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: ${mimeType}`,
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

describe('RBAC enforcement on POST /api/v1/imports/preview', () => {
  it('devuelve 403 cuando no se envía un rol autorizado', async () => {
    const app = await buildApp();
    apps.push(app);
    const boundary = '----rbacTestBoundary1';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipartCsvBody(boundary, 'orders.csv', 'text/csv', CSV_BODY),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('devuelve 403 cuando el rol enviado no tiene el permiso requerido', async () => {
    const app = await buildApp();
    apps.push(app);
    const boundary = '----rbacTestBoundary2';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'ADVISOR_READONLY',
      },
      payload: multipartCsvBody(boundary, 'orders.csv', 'text/csv', CSV_BODY),
    });
    expect(response.statusCode).toBe(403);
  });

  it('deja pasar al handler cuando el rol tiene el permiso requerido', async () => {
    const app = await buildApp();
    apps.push(app);
    const boundary = '----rbacTestBoundary3';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'FISCAL_OPERATOR',
      },
      payload: multipartCsvBody(boundary, 'orders.csv', 'text/csv', CSV_BODY),
    });
    expect(response.statusCode).not.toBe(403);
  });

  it('ADMIN también puede pasar la comprobación de rol', async () => {
    const app = await buildApp();
    apps.push(app);
    const boundary = '----rbacTestBoundary4';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'ADMIN',
      },
      payload: multipartCsvBody(boundary, 'orders.csv', 'text/csv', CSV_BODY),
    });
    expect(response.statusCode).not.toBe(403);
  });

  it('falla cerrado en producción aunque el cliente falsifique la cabecera', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_SECRET', 'production-test-secret-with-32-characters');
    const app = await buildApp();
    apps.push(app);
    const boundary = '----rbacTestBoundaryProduction';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'ADMIN',
      },
      payload: multipartCsvBody(boundary, 'orders.csv', 'text/csv', CSV_BODY),
    });
    expect(response.statusCode).toBe(403);
  });

  it('rechaza el arranque en producción sin un secreto de sesión robusto', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_SECRET', 'short');
    await expect(buildApp()).rejects.toThrow('SESSION_SECRET');
  });
});

describe('MIME-type allowlist on POST /api/v1/imports/preview', () => {
  it('devuelve 422 para un tipo de archivo no admitido', async () => {
    const app = await buildApp();
    apps.push(app);
    const boundary = '----rbacTestBoundary5';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'FISCAL_OPERATOR',
      },
      payload: multipartCsvBody(boundary, 'notes.txt', 'text/plain', 'hola'),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'UNSUPPORTED_MIME_TYPE' });
  });
});
