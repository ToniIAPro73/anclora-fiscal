import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { ImportLifecycleRepositoryPort } from './import-lifecycle-controller';
import type { FiscalPersistencePort } from './import-preview-persistence';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(
  repository?: ImportLifecycleRepositoryPort,
  storageGet?: (key: string) => Promise<Uint8Array>,
  fiscalPersistence?: FiscalPersistencePort,
) {
  const app = await buildApp({
    importLifecycleRepository: repository,
    fiscalPersistence,
    ...(storageGet ? { storage: { put: async () => { throw new Error('no debería subir evidencia en estas pruebas'); }, get: storageGet } } : {}),
    authService: new AuthService({ authenticate: async () => ({
      actorId: '01977d43-75de-7000-8000-000000000020',
      tenantId: '01977d43-75de-7000-8000-000000000010',
      email: 'operator@example.test', displayName: 'Operador', role: 'FISCAL_OPERATOR',
    }) }, { record: async () => undefined }),
  });
  apps.push(app);
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'operator@example.test', password: 'valid-password' } });
  const setCookie = login.headers['set-cookie'];
  return { app, cookie: (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '' };
}

describe('POST /api/v1/imports/:jobId/confirm', () => {
  it('devuelve 401 sin sesión', async () => {
    const app = await buildApp({ importLifecycleRepository: { findJob: vi.fn(), listIssues: vi.fn(), confirm: vi.fn(), reject: vi.fn(), findJobWithFile: vi.fn(), recordRetry: vi.fn() } });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/confirm', payload: {} });
    expect(response.statusCode).toBe(401);
  });

  it('devuelve 404 cuando el job no existe', async () => {
    const { app, cookie } = await authenticatedApp(
      { findJob: vi.fn().mockResolvedValue(undefined), listIssues: vi.fn(), confirm: vi.fn(), reject: vi.fn(), findJobWithFile: vi.fn(), recordRetry: vi.fn() },
      async () => new Uint8Array(),
      { persistFiscalRecords: vi.fn() },
    );
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/confirm', headers: { cookie }, payload: {} });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'IMPORT_JOB_NOT_FOUND' });
  });

  it('devuelve 422 con incidencias bloqueantes sin reconocer', async () => {
    const { app, cookie } = await authenticatedApp(
      {
        findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'ANALYZED' }),
        listIssues: vi.fn().mockResolvedValue([{ id: 'issue-1', blocking: true }]),
        confirm: vi.fn(),
        reject: vi.fn(),
        findJobWithFile: vi.fn(),
        recordRetry: vi.fn(),
      },
      async () => new Uint8Array(),
      { persistFiscalRecords: vi.fn() },
    );
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/confirm', headers: { cookie }, payload: {} });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'IMPORT_JOB_BLOCKING_ISSUES', unacknowledgedIssueIds: ['issue-1'] });
  });

  it('confirma y devuelve IMPORTED cuando no hay incidencias, reanalizando el archivo custodiado y persistiendo los registros fiscales', async () => {
    const csv = await readFile(resolve(import.meta.dirname, '../../../.evidence/payment_transactions_export_1.csv'));
    const confirm = vi.fn().mockResolvedValue(undefined);
    const persistFiscalRecords = vi.fn().mockResolvedValue({ createdRecordIds: { commercialOrders: ['o1'] } });
    const { app, cookie } = await authenticatedApp(
      {
        findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'ANALYZED' }),
        listIssues: vi.fn().mockResolvedValue([]),
        confirm,
        reject: vi.fn(),
        findJobWithFile: vi.fn().mockResolvedValue({ id: 'job-1', status: 'ANALYZED', storageKey: 'tenant/evidence', sha256: 'a'.repeat(64), mimeType: 'text/csv', importFileId: 'file-1' }),
        recordRetry: vi.fn(),
      },
      async () => csv,
      { persistFiscalRecords },
    );
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/confirm', headers: { cookie }, payload: { acknowledgedIssueIds: [] } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ jobId: 'job-1', status: 'IMPORTED', createdRecordIds: { commercialOrders: ['o1'] } });
    expect(persistFiscalRecords).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'file-1', expect.objectContaining({ connector: 'shopify-csv' }));
    expect(confirm).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'job-1', 'IMPORTED');
  });

  it('devuelve 503 sin repositorio inyectado', async () => {
    const { app, cookie } = await authenticatedApp(undefined, async () => new Uint8Array(), { persistFiscalRecords: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/confirm', headers: { cookie }, payload: {} });
    expect(response.statusCode).toBe(503);
  });

  it('devuelve 503 sin fiscalPersistence inyectado', async () => {
    const { app, cookie } = await authenticatedApp({ findJob: vi.fn(), listIssues: vi.fn(), confirm: vi.fn(), reject: vi.fn(), findJobWithFile: vi.fn(), recordRetry: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/confirm', headers: { cookie }, payload: {} });
    expect(response.statusCode).toBe(503);
  });
});

describe('POST /api/v1/imports/:jobId/reject', () => {
  it('devuelve 409 cuando el job ya fue confirmado', async () => {
    const { app, cookie } = await authenticatedApp({
      findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'IMPORTED' }),
      listIssues: vi.fn(),
      confirm: vi.fn(),
      reject: vi.fn(),
      findJobWithFile: vi.fn(),
      recordRetry: vi.fn(),
    });
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/reject', headers: { cookie }, payload: { reason: 'x' } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'IMPORT_JOB_ALREADY_CONFIRMED' });
  });

  it('rechaza el job y devuelve REJECTED', async () => {
    const reject = vi.fn().mockResolvedValue(undefined);
    const { app, cookie } = await authenticatedApp({
      findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'ANALYZED' }),
      listIssues: vi.fn(),
      confirm: vi.fn(),
      reject,
      findJobWithFile: vi.fn(),
      recordRetry: vi.fn(),
    });
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/reject', headers: { cookie }, payload: { reason: 'Datos incorrectos' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ jobId: 'job-1', status: 'REJECTED' });
    expect(reject).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'job-1', 'Datos incorrectos');
  });
});

describe('POST /api/v1/imports/:jobId/retry', () => {
  it('devuelve 404 cuando el job/archivo no existe', async () => {
    const { app, cookie } = await authenticatedApp({
      findJob: vi.fn(),
      listIssues: vi.fn(),
      confirm: vi.fn(),
      reject: vi.fn(),
      findJobWithFile: vi.fn().mockResolvedValue(undefined),
      recordRetry: vi.fn(),
    });
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/retry', headers: { cookie }, payload: {} });
    expect(response.statusCode).toBe(404);
  });

  it('reanaliza el archivo y no duplica el job (idempotente)', async () => {
    const recordRetry = vi.fn().mockResolvedValue(undefined);
    const csv = await readFile(resolve(import.meta.dirname, '../../../.evidence/payment_transactions_export_1.csv'));
    const { app, cookie } = await authenticatedApp(
      {
        findJob: vi.fn(),
        listIssues: vi.fn(),
        confirm: vi.fn(),
        reject: vi.fn(),
        findJobWithFile: vi.fn().mockResolvedValue({ id: 'job-1', status: 'FAILED', storageKey: 'tenant/evidence', sha256: 'a'.repeat(64), mimeType: 'text/csv' }),
        recordRetry,
      },
      async () => csv,
    );
    const response = await app.inject({ method: 'POST', url: '/api/v1/imports/job-1/retry', headers: { cookie }, payload: { reason: 'reintento' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ jobId: 'job-1', status: 'ANALYZED' });
    expect(recordRetry).toHaveBeenCalledOnce();
  });
});
