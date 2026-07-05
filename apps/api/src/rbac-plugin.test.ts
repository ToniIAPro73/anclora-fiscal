import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const CSV_BODY = 'Order,Refunded Amount\nAI-1001,0\n';

async function authenticatedApp(role: Role) {
  const app = await buildApp({
    authService: new AuthService({ authenticate: async () => ({
      actorId: '01977d43-75de-7000-8000-000000000020',
      tenantId: '01977d43-75de-7000-8000-000000000010',
      email: 'operator@example.test', displayName: 'Operador', role,
    }) }, { record: async () => undefined }),
  });
  apps.push(app);
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'operator@example.test', password: 'valid-password' } });
  const setCookie = login.headers['set-cookie'];
  return { app, cookie: (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '' };
}

function multipartCsvBody(boundary: string, filename: string, mimeType: string, content: string) {
  return [
    `--${boundary}`,
    'Content-Disposition: form-data; name="connectorId"',
    '',
    'shopify-orders',
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
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol enviado no tiene el permiso requerido', async () => {
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY');
    const boundary = '----rbacTestBoundary2';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'ADVISOR_READONLY',
        cookie,
      },
      payload: multipartCsvBody(boundary, 'orders.csv', 'text/csv', CSV_BODY),
    });
    expect(response.statusCode).toBe(403);
  });

  it('deja pasar al handler cuando el rol tiene el permiso requerido', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR');
    const boundary = '----rbacTestBoundary3';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'FISCAL_OPERATOR',
        cookie,
      },
      payload: multipartCsvBody(boundary, 'orders.csv', 'text/csv', CSV_BODY),
    });
    expect(response.statusCode).not.toBe(403);
  });

  it('ADMIN también puede pasar la comprobación de rol', async () => {
    const { app, cookie } = await authenticatedApp('ADMIN');
    const boundary = '----rbacTestBoundary4';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'ADMIN',
        cookie,
      },
      payload: multipartCsvBody(boundary, 'orders.csv', 'text/csv', CSV_BODY),
    });
    expect(response.statusCode).not.toBe(403);
  });

  it('ignora una cabecera de rol falsificada cuando no existe sesión', async () => {
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
    expect(response.statusCode).toBe(401);
  });

  it('rechaza el arranque en producción sin un secreto de sesión robusto', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_SECRET', 'short');
    await expect(buildApp()).rejects.toThrow('SESSION_SECRET');
  });
});

describe('MIME-type allowlist on POST /api/v1/imports/preview', () => {
  it('devuelve 422 para un tipo de archivo no admitido', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR');
    const boundary = '----rbacTestBoundary5';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-anclora-role': 'FISCAL_OPERATOR',
        cookie,
      },
      payload: multipartCsvBody(boundary, 'notes.txt', 'text/plain', 'hola'),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'UNSUPPORTED_MIME_TYPE' });
  });
});
