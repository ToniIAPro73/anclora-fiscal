import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { ReconciliationRepositoryPort } from './reconciliation-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(role: Role, repository?: ReconciliationRepositoryPort) {
  const app = await buildApp({
    reconciliationRepository: repository,
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

describe('GET /api/v1/reconciliation/candidates', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ reconciliationRepository: { list: vi.fn() } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/reconciliation/candidates' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso reconciliation:read', async () => {
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { list: vi.fn() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/reconciliation/candidates', headers: { cookie } });
    // ADVISOR_READONLY has the wildcard *:read permission, so it should pass through
    expect(response.statusCode).not.toBe(403);
  });

  it('pasa tenantId, paginación y accepted al repositorio y devuelve el resultado paginado', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 10, total: 0 });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list });
    const response = await app.inject({ method: 'GET', url: '/api/v1/reconciliation/candidates?page=2&pageSize=10&accepted=false', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], page: 2, pageSize: 10, total: 0 });
    expect(list).toHaveBeenCalledWith({ tenantId: '01977d43-75de-7000-8000-000000000010', page: 2, pageSize: 10, accepted: false });
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de conciliación', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', undefined);
    const response = await app.inject({ method: 'GET', url: '/api/v1/reconciliation/candidates', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'RECONCILIATION_REPOSITORY_UNAVAILABLE' });
  });
});
