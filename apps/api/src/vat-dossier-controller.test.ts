import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Role } from '@anclora/core';
import type { StoragePort } from '@anclora/core/server';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { DossierIntegrityIncidentPort, VatDossiersRepositoryPort } from './vat-dossier-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

const noopStorage: StoragePort = {
  put: vi.fn().mockResolvedValue({ key: 'k', sha256: 'h', size: 1, mimeType: 'application/zip' }),
  get: vi.fn(),
};

async function authenticatedApp(role: Role, repository?: VatDossiersRepositoryPort, storage: StoragePort = noopStorage, integrityIncidents?: DossierIntegrityIncidentPort) {
  const app = await buildApp({
    vatDossiersRepository: repository,
    storage,
    dossierIntegrityIncidents: integrityIncidents,
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

describe('POST /api/v1/periods/:period/vat-dossier', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ vatDossiersRepository: { generate: vi.fn(), get: vi.fn() }, storage: noopStorage });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso dossier:write', async () => {
    const generate = vi.fn();
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { generate, get: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de expedientes de IVA', async () => {
    const { app, cookie } = await authenticatedApp('REVIEWER', undefined);
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'VAT_DOSSIERS_REPOSITORY_UNAVAILABLE' });
  });

  it('genera el expediente pasando tenantId, period, actorId y storage al repositorio', async () => {
    const dossier = { id: 'vd-1', tenantId: '01977d43-75de-7000-8000-000000000010', status: 'CLOSED', storageKey: 'k' };
    const generate = vi.fn().mockResolvedValue({ ok: true, dossier, alreadyGenerated: false });
    const { app, cookie } = await authenticatedApp('REVIEWER', { generate, get: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(dossier);
    expect(generate).toHaveBeenCalledWith({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      period: '2026-06',
      actorId: '01977d43-75de-7000-8000-000000000020',
      storage: noopStorage,
      force: false,
    });
  });

  it('devuelve 200 y el expediente existente cuando ya se había generado (idempotente)', async () => {
    const dossier = { id: 'vd-1', tenantId: '01977d43-75de-7000-8000-000000000010', status: 'CLOSED', storageKey: 'k' };
    const generate = vi.fn().mockResolvedValue({ ok: true, dossier, alreadyGenerated: true });
    const { app, cookie } = await authenticatedApp('REVIEWER', { generate, get: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(dossier);
  });

  it('devuelve 409 cuando el período no está cerrado', async () => {
    const generate = vi.fn().mockResolvedValue({ ok: false, reason: 'PERIOD_NOT_CLOSED' });
    const { app, cookie } = await authenticatedApp('REVIEWER', { generate, get: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'PERIOD_NOT_CLOSED' });
  });

  it('devuelve 409 cuando existen incidencias bloqueantes sin aprobación', async () => {
    const generate = vi.fn().mockResolvedValue({ ok: false, reason: 'BLOCKING_ISSUES_REQUIRE_APPROVAL' });
    const { app, cookie } = await authenticatedApp('REVIEWER', { generate, get: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'BLOCKING_ISSUES_REQUIRE_APPROVAL' });
  });

  it('pasa force=true al repositorio cuando el rol es REVIEWER y se solicita ?force=true', async () => {
    const dossier = { id: 'vd-1', tenantId: '01977d43-75de-7000-8000-000000000010', status: 'CLOSED', storageKey: 'k' };
    const generate = vi.fn().mockResolvedValue({ ok: true, dossier, alreadyGenerated: false });
    const { app, cookie } = await authenticatedApp('REVIEWER', { generate, get: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier?force=true', headers: { cookie } });

    expect(response.statusCode).toBe(201);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
  });

  it('ignora ?force=true cuando el rol no es ADMIN ni REVIEWER', async () => {
    const dossier = { id: 'vd-1', tenantId: '01977d43-75de-7000-8000-000000000010', status: 'CLOSED', storageKey: 'k' };
    const generate = vi.fn().mockResolvedValue({ ok: true, dossier, alreadyGenerated: true });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { generate, get: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier?force=true', headers: { cookie } });

    // FISCAL_OPERATOR lacks dossier:write entirely, so the request never
    // reaches the handler — this asserts the RBAC gate, not the force logic.
    expect(response.statusCode).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/periods/:period/vat-dossier', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ vatDossiersRepository: { generate: vi.fn(), get: vi.fn() }, storage: noopStorage });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/periods/2026-06/vat-dossier' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('permite el acceso a ADVISOR_READONLY vía el permiso comodín *:read', async () => {
    const get = vi.fn().mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { generate: vi.fn(), get });
    const response = await app.inject({ method: 'GET', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });
    expect(response.statusCode).toBe(404);
    expect(get).toHaveBeenCalled();
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de expedientes de IVA', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', undefined);
    const response = await app.inject({ method: 'GET', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'VAT_DOSSIERS_REPOSITORY_UNAVAILABLE' });
  });

  it('devuelve 404 cuando no existe expediente para el período', async () => {
    const get = vi.fn().mockResolvedValue({ ok: false, reason: 'NOT_FOUND' });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { generate: vi.fn(), get });
    const response = await app.inject({ method: 'GET', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('devuelve la metadata sin exponer storageKey', async () => {
    const dossier = { id: 'vd-1', tenantId: '01977d43-75de-7000-8000-000000000010', status: 'CLOSED', storageKey: 'tenant/vd-1.zip', archiveSha256: 'abc' };
    const get = vi.fn().mockResolvedValue({ ok: true, dossier });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { generate: vi.fn(), get });
    const response = await app.inject({ method: 'GET', url: '/api/v1/periods/2026-06/vat-dossier', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({ id: 'vd-1', archiveSha256: 'abc' }));
    expect(response.json()).not.toHaveProperty('storageKey');
    expect(get).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', '2026-06');
  });
});

describe('GET /api/v1/periods/:period/vat-dossier/archive', () => {
  const bytes = Buffer.from('zip-real');
  const archiveSha256 = createHash('sha256').update(bytes).digest('hex');
  const dossier = { id: 'vd-1', tenantId: '01977d43-75de-7000-8000-000000000010', status: 'CLOSED', storageKey: 'tenant/vd-1.zip', archiveSha256 };

  it('entrega el ZIP verificado con headers privados', async () => {
    const storage: StoragePort = { put: vi.fn(), get: vi.fn().mockResolvedValue(bytes) };
    const repository = { generate: vi.fn(), get: vi.fn().mockResolvedValue({ ok: true, dossier }) };
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', repository, storage);
    const response = await app.inject({ method: 'GET', url: '/api/v1/periods/2026-06/vat-dossier/archive', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(bytes);
    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.headers['content-disposition']).toBe('attachment; filename="expediente-iva-2026-06.zip"');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(storage.get).toHaveBeenCalledWith('tenant/vd-1.zip');
  });

  it('devuelve 404 y conserva el aislamiento por tenant delegado al repositorio', async () => {
    const repository = { generate: vi.fn(), get: vi.fn().mockResolvedValue({ ok: false, reason: 'NOT_FOUND' }) };
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', repository);
    const response = await app.inject({ method: 'GET', url: '/api/v1/periods/2026-06/vat-dossier/archive', headers: { cookie } });
    expect(response.statusCode).toBe(404);
    expect(repository.get).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', '2026-06');
  });

  it('bloquea un SHA incorrecto y reporta el incidente', async () => {
    const storage: StoragePort = { put: vi.fn(), get: vi.fn().mockResolvedValue(Buffer.from('alterado')) };
    const repository = { generate: vi.fn(), get: vi.fn().mockResolvedValue({ ok: true, dossier }) };
    const incidents = { report: vi.fn().mockResolvedValue(undefined) };
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', repository, storage, incidents);
    const response = await app.inject({ method: 'GET', url: '/api/v1/periods/2026-06/vat-dossier/archive', headers: { cookie } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'DOSSIER_INTEGRITY_ERROR' });
    expect(incidents.report).toHaveBeenCalledWith(expect.objectContaining({ tenantId: dossier.tenantId, dossierId: dossier.id }));
  });
});
