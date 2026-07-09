import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import type { StoragePort } from '@anclora/core/server';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { FiscalDocumentsRepositoryPort } from './fiscal-documents-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function withTemporaryEnv(
  values: Record<string, string | undefined>,
  run: () => Promise<void>,
) {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(values)) {
    previous.set(key, process.env[key]);
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const noopStorage: StoragePort = {
  put: vi.fn().mockResolvedValue({ key: 'k', sha256: 'h', size: 1, mimeType: 'application/pdf' }),
  get: vi.fn(),
};

async function authenticatedApp(role: Role, repository?: FiscalDocumentsRepositoryPort) {
  const app = await buildApp({
    fiscalDocumentsRepository: repository,
    storage: noopStorage,
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

describe('POST /api/v1/operations/:id/invoices', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ fiscalDocumentsRepository: { issue: vi.fn() }, storage: noopStorage });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/operations/op-1/invoices' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso documents:issue', async () => {
    const issue = vi.fn();
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { issue });
    const response = await app.inject({ method: 'POST', url: '/api/v1/operations/op-1/invoices', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    expect(issue).not.toHaveBeenCalled();
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de documentos fiscales', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', undefined);
    const response = await app.inject({ method: 'POST', url: '/api/v1/operations/op-1/invoices', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE' });
  });

  it('emite la factura pasando tenantId, actorId, canonicalOperationId y storage al repositorio', async () => {
    const document = { id: 'doc-1', tenantId: '01977d43-75de-7000-8000-000000000010', documentType: 'FULL_INVOICE' };
    const issue = vi.fn().mockResolvedValue({ ok: true, document, alreadyIssued: false });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { issue });
    const response = await app.inject({ method: 'POST', url: '/api/v1/operations/op-1/invoices', headers: { cookie } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(document);
    expect(issue).toHaveBeenCalledWith({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      actorId: '01977d43-75de-7000-8000-000000000020',
      canonicalOperationId: 'op-1',
      storage: noopStorage,
      verifactuConfig: expect.objectContaining({
        mode: 'disabled',
        enabled: false,
        canSubmit: false,
        productionSafe: true,
      }),
    });
  });

  it('pasa configuración VERI*FACTU test al emitir cuando el runtime está configurado', async () => {
    await withTemporaryEnv(
      {
        NODE_ENV: 'test',
        VERIFACTU_MODE: 'test',
        VERIFACTU_AEAT_ADAPTER_ENABLED: 'true',
        VERIFACTU_AEAT_SIGNING_ENABLED: 'true',
        VERIFACTU_AEAT_CERTIFICATE_PATH: '/secrets/aeat-test.p12',
        VERIFACTU_AEAT_CERTIFICATE_PASSWORD: 'configured',
        VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        VERIFACTU_AEAT_TEST_ENDPOINT_URL: 'https://aeat.test.example/verifactu',
      },
      async () => {
        const document = { id: 'doc-1', tenantId: '01977d43-75de-7000-8000-000000000010', documentType: 'FULL_INVOICE' };
        const issue = vi.fn().mockResolvedValue({ ok: true, document, alreadyIssued: false });
        const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { issue });

        const response = await app.inject({ method: 'POST', url: '/api/v1/operations/op-1/invoices', headers: { cookie } });

        expect(response.statusCode).toBe(201);
        expect(issue).toHaveBeenCalledWith(expect.objectContaining({
          tenantId: '01977d43-75de-7000-8000-000000000010',
          actorId: '01977d43-75de-7000-8000-000000000020',
          canonicalOperationId: 'op-1',
          storage: noopStorage,
          verifactuConfig: expect.objectContaining({
            mode: 'test',
            enabled: true,
            canSubmit: true,
            productionSafe: true,
          }),
        }));
      },
    );
  });

  it('devuelve 200 e el documento existente cuando la factura ya se había emitido (idempotente)', async () => {
    const document = { id: 'doc-1', tenantId: '01977d43-75de-7000-8000-000000000010', documentType: 'FULL_INVOICE' };
    const issue = vi.fn().mockResolvedValue({ ok: true, document, alreadyIssued: true });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { issue });
    const response = await app.inject({ method: 'POST', url: '/api/v1/operations/op-1/invoices', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(document);
  });

  it('devuelve 404 cuando la operación no existe en el tenant', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: false, reason: 'OPERATION_NOT_FOUND' });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { issue });
    const response = await app.inject({ method: 'POST', url: '/api/v1/operations/missing-op/invoices', headers: { cookie } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'OPERATION_NOT_FOUND' });
  });

  it('devuelve 422 cuando la operación no tiene una decisión fiscal', async () => {
    const issue = vi.fn().mockResolvedValue({ ok: false, reason: 'TAX_DECISION_MISSING' });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { issue });
    const response = await app.inject({ method: 'POST', url: '/api/v1/operations/op-1/invoices', headers: { cookie } });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'TAX_DECISION_MISSING' });
  });
});

describe('POST /api/v1/fiscal-documents/:id/rectify', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ fiscalDocumentsRepository: { issue: vi.fn(), rectify: vi.fn() }, storage: noopStorage });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/fiscal-documents/doc-1/rectify' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso documents:rectify', async () => {
    const rectify = vi.fn();
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { issue: vi.fn(), rectify });
    const response = await app.inject({ method: 'POST', url: '/api/v1/fiscal-documents/doc-1/rectify', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    expect(rectify).not.toHaveBeenCalled();
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de documentos fiscales', async () => {
    const { app, cookie } = await authenticatedApp('REVIEWER', undefined);
    const response = await app.inject({ method: 'POST', url: '/api/v1/fiscal-documents/doc-1/rectify', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE' });
  });

  it('rectifica la factura pasando tenantId, actorId, fiscalDocumentId y storage al repositorio', async () => {
    const document = { id: 'doc-2', tenantId: '01977d43-75de-7000-8000-000000000010', documentType: 'RECTIFYING_INVOICE' };
    const rectify = vi.fn().mockResolvedValue({ ok: true, document, alreadyRectified: false });
    const { app, cookie } = await authenticatedApp('REVIEWER', { issue: vi.fn(), rectify });
    const response = await app.inject({ method: 'POST', url: '/api/v1/fiscal-documents/doc-1/rectify', headers: { cookie } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(document);
    expect(rectify).toHaveBeenCalledWith({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      actorId: '01977d43-75de-7000-8000-000000000020',
      fiscalDocumentId: 'doc-1',
      storage: noopStorage,
      verifactuConfig: expect.objectContaining({
        mode: 'disabled',
        enabled: false,
        canSubmit: false,
        productionSafe: true,
      }),
    });
  });

  it('devuelve 200 y el documento existente cuando la factura ya había sido rectificada (idempotente)', async () => {
    const document = { id: 'doc-2', tenantId: '01977d43-75de-7000-8000-000000000010', documentType: 'RECTIFYING_INVOICE' };
    const rectify = vi.fn().mockResolvedValue({ ok: true, document, alreadyRectified: true });
    const { app, cookie } = await authenticatedApp('REVIEWER', { issue: vi.fn(), rectify });
    const response = await app.inject({ method: 'POST', url: '/api/v1/fiscal-documents/doc-1/rectify', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(document);
  });

  it('devuelve 404 cuando el documento fiscal no existe en el tenant', async () => {
    const rectify = vi.fn().mockResolvedValue({ ok: false, reason: 'DOCUMENT_NOT_FOUND' });
    const { app, cookie } = await authenticatedApp('REVIEWER', { issue: vi.fn(), rectify });
    const response = await app.inject({ method: 'POST', url: '/api/v1/fiscal-documents/missing-doc/rectify', headers: { cookie } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });

  it('devuelve 409 cuando el documento no está en un estado rectificable', async () => {
    const rectify = vi.fn().mockResolvedValue({ ok: false, reason: 'INVALID_DOCUMENT_STATE' });
    const { app, cookie } = await authenticatedApp('REVIEWER', { issue: vi.fn(), rectify });
    const response = await app.inject({ method: 'POST', url: '/api/v1/fiscal-documents/doc-1/rectify', headers: { cookie } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'INVALID_DOCUMENT_STATE' });
  });
});

describe('GET /api/v1/fiscal-documents/:id/download', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const findById = vi.fn();
    const app = await buildApp({ fiscalDocumentsRepository: { issue: vi.fn(), findById }, storage: noopStorage });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/fiscal-documents/doc-1/download' });
    expect(response.statusCode).toBe(401);
    expect(findById).not.toHaveBeenCalled();
  });

  it('descarga el PDF tenant-scoped desde storage', async () => {
    const pdfBytes = new TextEncoder().encode('%PDF-1.4');
    const storage: StoragePort = {
      put: vi.fn(),
      get: vi.fn().mockResolvedValue(pdfBytes),
    };
    const document = {
      id: 'doc-1',
      tenantId: '01977d43-75de-7000-8000-000000000010',
      canonicalOperationId: 'op-1',
      number: 'F-00001',
      documentType: 'FULL_INVOICE',
      status: 'ISSUED',
      issuedAt: new Date(),
      taxBase: '6.35',
      taxAmount: '0.64',
      totalAmount: '6.99',
      currency: 'EUR',
      renderStorageKey: 'tenant/doc-1.pdf',
      renderSha256: 'sha',
      locked: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const findById = vi.fn().mockResolvedValue(document);
    const app = await buildApp({
      fiscalDocumentsRepository: { issue: vi.fn(), findById },
      storage,
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

    const response = await app.inject({ method: 'GET', url: '/api/v1/fiscal-documents/doc-1/download', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe('attachment; filename="F-00001.pdf"');
    expect(response.body).toBe('%PDF-1.4');
    expect(findById).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'doc-1');
    expect(storage.get).toHaveBeenCalledWith('tenant/doc-1.pdf');
  });

  it('devuelve 404 si el documento no pertenece al tenant autenticado', async () => {
    const findById = vi.fn().mockResolvedValue(null);
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { issue: vi.fn(), findById });
    const response = await app.inject({ method: 'GET', url: '/api/v1/fiscal-documents/doc-missing/download', headers: { cookie } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });
});
