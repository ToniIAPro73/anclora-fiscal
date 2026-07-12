import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { SifEventsRepositoryPort } from './sif-events-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(role: Role, repository?: SifEventsRepositoryPort) {
  const app = await buildApp({
    sifEventsRepository: repository,
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

describe('GET /api/v1/sif-events', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const list = vi.fn();
    const app = await buildApp({ sifEventsRepository: { list, verifyChain: vi.fn() } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/sif-events' });
    expect(response.statusCode).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('devuelve 503 cuando el repositorio no está disponible', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR');
    const response = await app.inject({ method: 'GET', url: '/api/v1/sif-events', headers: { cookie } });
    expect(response.statusCode).toBe(503);
  });

  it('devuelve la página de eventos del tenant', async () => {
    const list = vi.fn().mockResolvedValue({ items: [{ id: 'evt-1' }], page: 1, pageSize: 25, total: 1 });
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list, verifyChain: vi.fn() });

    const response = await app.inject({ method: 'GET', url: '/api/v1/sif-events', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [{ id: 'evt-1' }], page: 1, pageSize: 25, total: 1 });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: '01977d43-75de-7000-8000-000000000010' }));
  });
});

describe('GET /api/v1/sif-events/verify', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const verifyChain = vi.fn();
    const app = await buildApp({ sifEventsRepository: { list: vi.fn(), verifyChain } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/sif-events/verify' });
    expect(response.statusCode).toBe(401);
    expect(verifyChain).not.toHaveBeenCalled();
  });

  it('devuelve el resultado de la verificación de cadena', async () => {
    const verifyChain = vi.fn().mockResolvedValue(true);
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list: vi.fn(), verifyChain });

    const response = await app.inject({ method: 'GET', url: '/api/v1/sif-events/verify', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ valid: true });
    expect(verifyChain).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010');
  });
});
