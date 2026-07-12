import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { ShopifyAdvisoryExportRow, ShopifySalesRepositoryPort } from './shopify-sales-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(role: Role, repository?: ShopifySalesRepositoryPort) {
  const app = await buildApp({
    shopifySalesRepository: repository,
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

const sampleRow: ShopifyAdvisoryExportRow = {
  commercialDate: new Date('2026-07-05T10:00:00.000Z'),
  externalOrderId: 'ORDER-1',
  customerCountry: 'ES',
  channel: 'Shopify',
  totalAmount: 6.99,
  taxBase: 6.72,
  taxAmount: 0.27,
  taxRate: 0.0402,
  fiscalStatus: 'INVOICED',
  documentType: 'SIMPLIFICADA',
  documentNumber: 'FS-00001',
  reconciliationStatus: 'MATCHED',
  verifactuStatus: 'PENDING',
  settlementStatus: 'SETTLED',
};

describe('GET /api/v1/shopify/sales/export', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const exportAdvisory = vi.fn();
    const app = await buildApp({ shopifySalesRepository: { list: vi.fn(), getById: vi.fn(), exportAdvisory } });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/shopify/sales/export' });
    expect(response.statusCode).toBe(401);
    expect(exportAdvisory).not.toHaveBeenCalled();
  });

  it('devuelve 503 cuando el repositorio no soporta exportación', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list: vi.fn(), getById: vi.fn() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/shopify/sales/export', headers: { cookie } });
    expect(response.statusCode).toBe(503);
  });

  it('devuelve un CSV con cabecera y filas formateadas', async () => {
    const exportAdvisory = vi.fn().mockResolvedValue([sampleRow]);
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list: vi.fn(), getById: vi.fn(), exportAdvisory });

    const response = await app.inject({ method: 'GET', url: '/api/v1/shopify/sales/export', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toBe('attachment; filename="ventas-shopify-asesoria.csv"');

    const lines = response.body.trim().split('\r\n');
    expect(lines[0]).toBe('order_date,shopify_order,country,channel,total_amount,tax_base,tax_amount,tax_rate,fiscal_status,document_type,document_number,reconciliation_status,verifactu_status,settlement_status');
    expect(lines[1]).toBe('2026-07-05,ORDER-1,ES,Shopify,6.99,6.72,0.27,0.0402,INVOICED,SIMPLIFICADA,FS-00001,MATCHED,PENDING,SETTLED');
  });

  it('pasa los filtros de query al repositorio', async () => {
    const exportAdvisory = vi.fn().mockResolvedValue([]);
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list: vi.fn(), getById: vi.fn(), exportAdvisory });

    await app.inject({
      method: 'GET',
      url: '/api/v1/shopify/sales/export?dateFrom=2026-07-01&dateTo=2026-07-31&fiscalStatus=INVOICED',
      headers: { cookie },
    });

    expect(exportAdvisory).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      fiscalStatus: 'INVOICED',
    }));
  });
});
