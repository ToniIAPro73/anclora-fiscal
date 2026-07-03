import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import type { StoragePort } from '@anclora/core/server';
import { buildApp } from './app';
import { AuthService } from './auth-service';
import type { FiscalDocumentsRepositoryPort } from './fiscal-documents-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

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
    });
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
