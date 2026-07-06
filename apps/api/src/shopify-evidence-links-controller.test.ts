import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(repository: { list: ReturnType<typeof vi.fn>; decide: ReturnType<typeof vi.fn> }) {
  const app = await buildApp({
    shopifyEvidenceLinksRepository: repository,
    authService: new AuthService({ authenticate: async () => ({
      actorId: '01977d43-75de-7000-8000-000000000020', tenantId: '01977d43-75de-7000-8000-000000000010',
      email: 'operator@example.test', displayName: 'Operador', role: 'FISCAL_OPERATOR',
    }) }, { record: async () => undefined }),
  });
  apps.push(app);
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'operator@example.test', password: 'valid-password' } });
  const setCookie = login.headers['set-cookie'];
  return { app, cookie: (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '' };
}

describe('Shopify evidence links API', () => {
  it('lista por tenant y estado sin exponer datos de otros tenants', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 'link-1', state: 'PROPOSED' }]);
    const { app, cookie } = await authenticatedApp({ list, decide: vi.fn() });

    const response = await app.inject({ method: 'GET', url: '/api/v1/shopify/evidence-links?state=PROPOSED', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: 'link-1', state: 'PROPOSED' }]);
    expect(list).toHaveBeenCalledWith({ tenantId: '01977d43-75de-7000-8000-000000000010', state: 'PROPOSED' });
  });

  it.each(['CONFIRMED', 'REJECTED'] as const)('registra la decisión manual %s con el actor autenticado', async (state) => {
    const decide = vi.fn().mockResolvedValue({ id: '01977d43-75de-7000-8000-000000000099', state });
    const { app, cookie } = await authenticatedApp({ list: vi.fn(), decide });

    const response = await app.inject({ method: 'PATCH', url: '/api/v1/shopify/evidence-links/01977d43-75de-7000-8000-000000000099', headers: { cookie }, payload: { state } });

    expect(response.statusCode).toBe(200);
    expect(decide).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010', '01977d43-75de-7000-8000-000000000099', '01977d43-75de-7000-8000-000000000020', state);
  });

  it('rechaza un estado que intentaría convertir evidencia en conciliación bancaria', async () => {
    const { app, cookie } = await authenticatedApp({ list: vi.fn(), decide: vi.fn() });
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/shopify/evidence-links/01977d43-75de-7000-8000-000000000099', headers: { cookie }, payload: { state: 'BANK_RECONCILED' } });
    expect(response.statusCode).toBe(400);
  });
});
