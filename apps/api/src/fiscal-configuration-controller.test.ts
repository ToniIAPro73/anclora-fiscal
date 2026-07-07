import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { FiscalConfigurationRepositoryPort } from './fiscal-configuration-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(repository: FiscalConfigurationRepositoryPort) {
  const app = await buildApp({ fiscalConfigurationRepository: repository, authService: new AuthService({ authenticate: async () => ({ actorId: '01977d43-75de-7000-8000-000000000020', tenantId: '01977d43-75de-7000-8000-000000000010', email: 'operator@example.test', displayName: 'Operador', role: 'FISCAL_OPERATOR' }) }, { record: async () => undefined }) });
  apps.push(app);
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'operator@example.test', password: 'valid-password' } });
  const setCookie = login.headers['set-cookie'];
  return { app, cookie: (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '' };
}

const payload = { legalEntity: { legalName: 'Editorial', countryCode: 'ES', currencyCode: 'EUR', address: 'Calle 1' }, series: { code: 'F', fiscalYear: 2026, documentType: 'FULL_INVOICE' }, productProfile: { selector: 'ebook-*', productNature: 'ebook', invoiceDescription: 'Libro electrónico', domesticTaxCode: 'ES_IVA_4', domesticTaxRate: '0.04', ossEligible: true, shippingRequired: false, effectiveFrom: '2026-01-01' }, kdpPolicy: { version: '1', effectiveFrom: '2026-01-01', accountingPolicy: 'NET_ROYALTY_ONLY', embeddedCostTreatment: 'INCLUDED_IN_NET', reviewLevel: 'REVIEW_REQUIRED' } };

describe('fiscal configuration API', () => {
  it('aísla por tenant y no expone el valor cifrado del NIF', async () => {
    const get = vi.fn().mockResolvedValue({ legalEntity: { legalName: 'Editorial', taxIdentityEncrypted: 'secret-ciphertext' }, readiness: { ready: false, missing: [] } });
    const { app, cookie } = await authenticatedApp({ get, saveMinimum: vi.fn() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/fiscal-configuration', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('secret-ciphertext');
    expect(response.json().legalEntity.taxIdentityConfigured).toBe(true);
    expect(get).toHaveBeenCalledWith('01977d43-75de-7000-8000-000000000010');
  });

  it('valida y persiste la configuración mínima con actor y tenant de sesión', async () => {
    const saveMinimum = vi.fn().mockResolvedValue({ legalEntity: null, readiness: { ready: true, missing: [] } });
    const { app, cookie } = await authenticatedApp({ get: vi.fn(), saveMinimum });
    const response = await app.inject({ method: 'PUT', url: '/api/v1/fiscal-configuration', headers: { cookie }, payload });
    expect(response.statusCode).toBe(200);
    expect(saveMinimum).toHaveBeenCalledWith(expect.objectContaining({ tenantId: '01977d43-75de-7000-8000-000000000010', actorId: '01977d43-75de-7000-8000-000000000020' }));
  });

  it('valida NIF/NIE, cifra el identificador y persiste el contrato español del emisor', async () => {
    const saveIssuerConfiguration = vi.fn().mockResolvedValue({ legalEntity: { taxIdentityEncrypted: 'ciphertext' }, readiness: { ready: true, missing: [] } });
    const { app, cookie } = await authenticatedApp({ get: vi.fn(), saveMinimum: vi.fn(), saveIssuerConfiguration });
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/fiscal-configuration',
      headers: { cookie },
      payload: {
        datosEmisor: {
          tipoEmisor: 'PERSONA_FISICA',
          nombreLegal: 'Antonio Ballesteros Alonso',
          nombreComercial: 'Anclora Fiscal',
          nifNie: '12345678Z',
          direccionFiscal: 'Calle Fiscal 1',
          emailContacto: 'antonio@example.test',
          pais: 'ES',
          moneda: 'EUR',
          epigrafeIAE: '861.1',
          regimenIVA: 'REGIMEN_REDUCIDO_LIBROS_ES',
        },
        oss: { activo: true, vigenteDesde: '2026-01-01' },
        perfilProducto: {
          selector: 'ebook-*',
          naturalezaProducto: 'LIBRO_ELECTRONICO',
          descripcionFactura: 'Libro electrónico',
          codigoIVA: 'ES_IVA_4',
          tipoIVA: '0.04',
          elegibleOSS: true,
          requiereEnvio: false,
          vigenteDesde: '2026-01-01',
        },
        ejercicio: 2026,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('12345678Z');
    expect(saveIssuerConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      actorId: '01977d43-75de-7000-8000-000000000020',
      datosEmisor: expect.objectContaining({
        nifCifrado: expect.stringMatching(/^v1:/),
        regimenIVA: 'REGIMEN_REDUCIDO_LIBROS_ES',
      }),
    }));
  });

  it('rechaza NIF/NIE inválido en el contrato español', async () => {
    const saveIssuerConfiguration = vi.fn();
    const { app, cookie } = await authenticatedApp({ get: vi.fn(), saveMinimum: vi.fn(), saveIssuerConfiguration });
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/fiscal-configuration',
      headers: { cookie },
      payload: {
        datosEmisor: {
          tipoEmisor: 'PERSONA_FISICA',
          nombreLegal: 'Antonio Ballesteros Alonso',
          nifNie: '12345678A',
          direccionFiscal: 'Calle Fiscal 1',
          pais: 'ES',
          moneda: 'EUR',
          epigrafeIAE: '861.1',
          regimenIVA: 'REGIMEN_REDUCIDO_LIBROS_ES',
        },
        oss: { activo: false },
        perfilProducto: {
          selector: 'ebook-*',
          naturalezaProducto: 'LIBRO_ELECTRONICO',
          descripcionFactura: 'Libro electrónico',
          codigoIVA: 'ES_IVA_4',
          tipoIVA: '0.04',
          elegibleOSS: true,
          requiereEnvio: false,
          vigenteDesde: '2026-01-01',
        },
        ejercicio: 2026,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toContainEqual(expect.objectContaining({ path: 'datosEmisor.nifNie' }));
    expect(saveIssuerConfiguration).not.toHaveBeenCalled();
  });
});
