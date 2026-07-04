import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { DashboardSummaryRepositoryPort } from './dashboard-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(role: Role, repository?: DashboardSummaryRepositoryPort) {
  const app = await buildApp({
    dashboardSummaryRepository: repository,
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

const summary = {
  openIssuesCount: 0,
  importsThisMonthCount: 2,
  reconciliationStatus: { matched: 1, unmatched: 1, total: 2 },
  documentsIssuedCount: 0,
  royalties: { statementsCount: 1, totalThisPeriod: '42.50' },
};

describe('GET /api/v1/dashboard/summary', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ dashboardSummaryRepository: { getSummary: vi.fn() } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard/summary' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 403 cuando el rol no tiene permiso dashboard:read', async () => {
    const { app, cookie } = await authenticatedApp('ADVISOR_READONLY', { getSummary: vi.fn().mockResolvedValue(summary) });
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard/summary', headers: { cookie } });
    // ADVISOR_READONLY has the wildcard *:read permission, so it should pass through
    expect(response.statusCode).not.toBe(403);
  });

  it('pasa tenantId al repositorio y devuelve el resumen', async () => {
    const getSummary = vi.fn().mockResolvedValue(summary);
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { getSummary });
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard/summary', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(summary);
    expect(getSummary).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010');
  });

  it('permite acceso a REVIEWER, que tiene dashboard:read explícito', async () => {
    const getSummary = vi.fn().mockResolvedValue(summary);
    const { app, cookie } = await authenticatedApp('REVIEWER', { getSummary });
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard/summary', headers: { cookie } });
    expect(response.statusCode).toBe(200);
  });

  it('devuelve 503 cuando no se ha inyectado un repositorio de resumen', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', undefined);
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard/summary', headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'DASHBOARD_REPOSITORY_UNAVAILABLE' });
  });
});
