import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth-service.js';
import { buildApp } from './build-app.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('GET /api/v1/commercial-orders', () => {
  it('devuelve los pedidos Shopify importados aunque no exista una operación canónica', async () => {
    const listByTenant = vi.fn().mockResolvedValue({
      items: [{ id: 'order-1', externalOrderId: 'AI-1001', sourceChannel: 'SHOPIFY', productNature: 'ebook' }],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    const app = await buildApp({
      commercialOrdersRepository: { listByTenant },
      authService: new AuthService({ authenticate: async () => ({
        actorId: '01977d43-75de-7000-8000-000000000020',
        tenantId: '01977d43-75de-7000-8000-000000000010',
        email: 'operator@example.test', displayName: 'Operador', role: 'FISCAL_OPERATOR',
      }) }, { record: async () => undefined }),
    });
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'operator@example.test', password: 'valid-password' } });
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '';

    const response = await app.inject({ method: 'GET', url: '/api/v1/commercial-orders', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json().items[0].externalOrderId).toBe('AI-1001');
    expect(listByTenant).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
  });
});
