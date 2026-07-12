import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticated(role: Role, repository: { list: ReturnType<typeof vi.fn>; resolve: ReturnType<typeof vi.fn> }) {
  const app = await buildApp({ systemAlertsRepository: repository, authService: new AuthService({ authenticate: async () => ({ actorId: '01977d43-75de-7000-8000-000000000020', tenantId: '01977d43-75de-7000-8000-000000000010', email: 'a@test.dev', displayName: 'A', role }) }, { record: async () => undefined }) });
  apps.push(app);
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'a@test.dev', password: 'valid-password' } });
  const value = login.headers['set-cookie'];
  return { app, cookie: (Array.isArray(value) ? value[0] : value)?.split(';')[0] ?? '' };
}

describe('system alerts API', () => {
  it('lista solo mediante el tenant de sesión', async () => {
    const repository = { list: vi.fn().mockResolvedValue([]), resolve: vi.fn() };
    const { app, cookie } = await authenticated('ADVISOR_READONLY', repository);
    expect((await app.inject({ method: 'GET', url: '/api/v1/system-alerts?status=OPEN', headers: { cookie } })).statusCode).toBe(200);
    expect(repository.list).toHaveBeenCalledWith({ tenantId: '01977d43-75de-7000-8000-000000000010', status: 'OPEN' });
  });

  it('readonly puede ver pero no resolver', async () => {
    const repository = { list: vi.fn().mockResolvedValue([]), resolve: vi.fn() };
    const { app, cookie } = await authenticated('ADVISOR_READONLY', repository);
    expect((await app.inject({ method: 'POST', url: '/api/v1/system-alerts/a1/resolve', headers: { cookie }, payload: { resolution: 'ok' } })).statusCode).toBe(403);
    expect(repository.resolve).not.toHaveBeenCalled();
  });

  it('reviewer resuelve con actor autenticado', async () => {
    const repository = { list: vi.fn(), resolve: vi.fn().mockResolvedValue({ id: 'a1', status: 'RESOLVED' }) };
    const { app, cookie } = await authenticated('REVIEWER', repository);
    expect((await app.inject({ method: 'POST', url: '/api/v1/system-alerts/a1/resolve', headers: { cookie }, payload: { resolution: 'Evidencia revisada' } })).statusCode).toBe(200);
    expect(repository.resolve).toHaveBeenCalledWith(expect.objectContaining({ tenantId: '01977d43-75de-7000-8000-000000000010', actorId: '01977d43-75de-7000-8000-000000000020' }));
  });
});
