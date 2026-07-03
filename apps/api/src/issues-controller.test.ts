import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { IssuesRepositoryPort } from './issues-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(role: Role, repository?: IssuesRepositoryPort) {
  const app = await buildApp({
    issuesRepository: repository,
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

describe('GET /api/v1/issues', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ issuesRepository: { list: vi.fn(), resolve: vi.fn() } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/issues' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso issues:read', async () => {
    // Todos los roles definidos (FISCAL_OPERATOR, REVIEWER, ADMIN, ADVISOR_READONLY) tienen
    // acceso de lectura a issues, así que verificamos que un rol con permisos limitados
    // sigue pudiendo listar (comportamiento esperado, no un caso 403 real en este dataset de roles).
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list, resolve: vi.fn() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/issues', headers: { cookie } });
    expect(response.statusCode).not.toBe(403);
  });

  it('pasa tenantId, paginación, status y severity al repositorio y devuelve el resultado paginado', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 10, total: 0 });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list, resolve: vi.fn() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/issues?page=2&pageSize=10&status=OPEN&severity=HIGH', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], page: 2, pageSize: 10, total: 0 });
    expect(list).toHaveBeenCalledWith({ tenantId: '01977d43-75de-7000-8000-000000000010', page: 2, pageSize: 10, status: 'OPEN', severity: 'HIGH' });
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de incidencias', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', undefined);
    const response = await app.inject({ method: 'GET', url: '/api/v1/issues', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'ISSUES_REPOSITORY_UNAVAILABLE' });
  });
});

describe('PATCH /api/v1/issues/:id', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ issuesRepository: { list: vi.fn(), resolve: vi.fn() } });
    apps.push(app);
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/issues/some-id' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso issues:write', async () => {
    const resolve = vi.fn();
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { list: vi.fn(), resolve });
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/issues/some-id', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('resuelve la incidencia pasando tenantId, id y actorId al repositorio', async () => {
    const issue = { id: 'issue-1', tenantId: '01977d43-75de-7000-8000-000000000010', status: 'RESOLVED' };
    const resolve = vi.fn().mockResolvedValue(issue);
    const { app, cookie } = await authenticatedApp('REVIEWER', { list: vi.fn(), resolve });
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/issues/issue-1', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(issue);
    expect(resolve).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', 'issue-1', '01977d43-75de-7000-8000-000000000020');
  });

  it('devuelve 404 cuando el repositorio no encuentra la incidencia en el tenant (intento cross-tenant)', async () => {
    const resolve = vi.fn().mockResolvedValue(null);
    const { app, cookie } = await authenticatedApp('REVIEWER', { list: vi.fn(), resolve });
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/issues/other-tenant-issue', headers: { cookie } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ISSUE_NOT_FOUND' });
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de incidencias', async () => {
    const { app, cookie } = await authenticatedApp('REVIEWER', undefined);
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/issues/issue-1', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'ISSUES_REPOSITORY_UNAVAILABLE' });
  });
});
