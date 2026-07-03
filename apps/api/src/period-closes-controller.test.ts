import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './app';
import { AuthService } from './auth-service';
import type { PeriodClosesRepositoryPort } from './period-closes-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(role: Role, repository?: PeriodClosesRepositoryPort) {
  const app = await buildApp({
    periodClosesRepository: repository,
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

describe('POST /api/v1/periods/:period/close', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ periodClosesRepository: { close: vi.fn(), reopen: vi.fn() } });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/close' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso periods:close', async () => {
    const close = vi.fn();
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { close, reopen: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/close', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    expect(close).not.toHaveBeenCalled();
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de cierre de períodos', async () => {
    const { app, cookie } = await authenticatedApp('REVIEWER', undefined);
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/close', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'PERIOD_CLOSES_REPOSITORY_UNAVAILABLE' });
  });

  it('cierra el período pasando tenantId, period y actorId al repositorio', async () => {
    const periodClose = { id: 'pc-1', tenantId: '01977d43-75de-7000-8000-000000000010', period: '2026-06', status: 'CLOSED' };
    const close = vi.fn().mockResolvedValue({ ok: true, periodClose, alreadyClosed: false });
    const { app, cookie } = await authenticatedApp('REVIEWER', { close, reopen: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/close', headers: { cookie } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(periodClose);
    expect(close).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', '2026-06', '01977d43-75de-7000-8000-000000000020');
  });

  it('devuelve 200 y la fila existente cuando el período ya estaba cerrado (idempotente)', async () => {
    const periodClose = { id: 'pc-1', tenantId: '01977d43-75de-7000-8000-000000000010', period: '2026-06', status: 'CLOSED' };
    const close = vi.fn().mockResolvedValue({ ok: true, periodClose, alreadyClosed: true });
    const { app, cookie } = await authenticatedApp('REVIEWER', { close, reopen: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/close', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(periodClose);
  });

  it('devuelve 409 con los ids de las incidencias bloqueantes cuando existen issues abiertos', async () => {
    const close = vi.fn().mockResolvedValue({ ok: false, reason: 'BLOCKING_ISSUES_OPEN', issueIds: ['issue-1', 'issue-2'] });
    const { app, cookie } = await authenticatedApp('REVIEWER', { close, reopen: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/close', headers: { cookie } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'BLOCKING_ISSUES_OPEN', issueIds: ['issue-1', 'issue-2'] });
  });
});

describe('POST /api/v1/periods/:period/reopen', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ periodClosesRepository: { close: vi.fn(), reopen: vi.fn() } });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/reopen' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso periods:close', async () => {
    const reopen = vi.fn();
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { close: vi.fn(), reopen });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/reopen', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    expect(reopen).not.toHaveBeenCalled();
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de cierre de períodos', async () => {
    const { app, cookie } = await authenticatedApp('REVIEWER', undefined);
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/reopen', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'PERIOD_CLOSES_REPOSITORY_UNAVAILABLE' });
  });

  it('reabre el período pasando tenantId, period y actorId al repositorio', async () => {
    const periodClose = { id: 'pc-1', tenantId: '01977d43-75de-7000-8000-000000000010', period: '2026-06', status: 'REOPENED_WITH_AUDIT_TRAIL' };
    const reopen = vi.fn().mockResolvedValue({ ok: true, periodClose });
    const { app, cookie } = await authenticatedApp('REVIEWER', { close: vi.fn(), reopen });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/reopen', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(periodClose);
    expect(reopen).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', '2026-06', '01977d43-75de-7000-8000-000000000020');
  });

  it('devuelve 409 cuando el período no está cerrado', async () => {
    const reopen = vi.fn().mockResolvedValue({ ok: false, reason: 'PERIOD_NOT_CLOSED' });
    const { app, cookie } = await authenticatedApp('REVIEWER', { close: vi.fn(), reopen });
    const response = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/reopen', headers: { cookie } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'PERIOD_NOT_CLOSED' });
  });
});
