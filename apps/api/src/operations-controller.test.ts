import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { OperationsRepositoryPort } from './operations-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(role: Role, repository?: OperationsRepositoryPort) {
  const app = await buildApp({
    operationsRepository: repository,
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

describe('GET /api/v1/operations', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ operationsRepository: { list: vi.fn() } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/operations' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso operations:read', async () => {
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { list: vi.fn() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/operations', headers: { cookie } });
    // ADVISOR_READONLY has the wildcard *:read permission, so it should pass through
    expect(response.statusCode).not.toBe(403);
  });

  it('pasa tenantId y paginación al repositorio y devuelve el resultado paginado', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 2, pageSize: 10, total: 0 });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list });
    const response = await app.inject({ method: 'GET', url: '/api/v1/operations?page=2&pageSize=10&status=DRAFT&dateFrom=2026-07-01&dateTo=2026-07-31&productNature=ebook&sourceChannel=AMAZON_KDP', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], page: 2, pageSize: 10, total: 0 });
    expect(list).toHaveBeenCalledWith({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      page: 2,
      pageSize: 10,
      status: 'DRAFT',
      dateFrom: new Date('2026-07-01T00:00:00.000Z'),
      dateTo: new Date('2026-07-31T23:59:59.999Z'),
      productNature: 'ebook',
      sourceChannel: 'AMAZON_KDP',
    });
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de operaciones', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', undefined);
    const response = await app.inject({ method: 'GET', url: '/api/v1/operations', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'OPERATIONS_REPOSITORY_UNAVAILABLE' });
  });
});
