import { describe, expect, it, vi } from 'vitest';
import { TaxDecisionService } from './tax-decision-service';

const tenantId = '01977d43-75de-7000-8000-000000000010';
const persistedTaxConfig = { id: 'TENANT_CONFIG', version: '2026-01-01', effectiveFrom: '2026-01-01', issuerCountry: 'ES', rates: [{ id: 'ES_EBOOK_4', rate: 0.04, productNature: 'ebook', customerCountry: 'ES' }], marketplaceRoyaltyExemptRate: 0, sources: [] };
const taxConfigurationRepository = { getTaxEngineConfig: vi.fn().mockResolvedValue(persistedTaxConfig) };

function baseOperation(overrides: Partial<Parameters<TaxDecisionService['runTaxDecisionForOperation']>[2]> = {}) {
  return {
    id: 'canonical-op-1',
    sourceChannel: 'SHOPIFY',
    operationType: 'SALE',
    grossAmount: '121.00',
    originalCurrency: 'EUR',
    customerCountry: 'ES',
    customerType: 'B2C',
    productNature: 'ebook',
    ...overrides,
  };
}

describe('TaxDecisionService', () => {
  it('determina el tipo ebook del 4% para un pedido B2C español', async () => {
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1', countryCode: 'ES' });
    const create = vi.fn().mockResolvedValue({ id: 'tax-decision-1' });
    const service = new TaxDecisionService({
      legalEntitiesRepository: { findFirstByTenant },
      taxDecisionsRepository: { create },
      taxConfigurationRepository,
    });

    const result = await service.runTaxDecisionForOperation(tenantId, 'canonical-op-1', baseOperation());

    expect(result).toEqual({ status: 'DECISION_REGISTRADA', taxDecisionStatus: 'DETERMINADA' });
    expect(create).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      canonicalOperationId: 'canonical-op-1',
      status: 'DETERMINADA',
      taxRate: '0.04',
    }));
  });

  it('marca PENDIENTE_REVISION_FISCAL para un pedido B2C fuera de España', async () => {
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1', countryCode: 'ES' });
    const create = vi.fn().mockResolvedValue({ id: 'tax-decision-2' });
    const service = new TaxDecisionService({
      legalEntitiesRepository: { findFirstByTenant },
      taxDecisionsRepository: { create },
      taxConfigurationRepository,
    });

    const result = await service.runTaxDecisionForOperation(tenantId, 'canonical-op-2', baseOperation({ customerCountry: 'FR' }));

    expect(result).toEqual({ status: 'DECISION_REGISTRADA', taxDecisionStatus: 'PENDIENTE_REVISION_FISCAL' });
    expect(create).toHaveBeenCalledWith(tenantId, expect.objectContaining({ status: 'PENDIENTE_REVISION_FISCAL' }));
  });

  it('marca BLOQUEADA por evidencia fiscal faltante cuando falta el país del cliente', async () => {
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1', countryCode: 'ES' });
    const create = vi.fn().mockResolvedValue({ id: 'tax-decision-3' });
    const service = new TaxDecisionService({
      legalEntitiesRepository: { findFirstByTenant },
      taxDecisionsRepository: { create },
      taxConfigurationRepository,
    });

    const result = await service.runTaxDecisionForOperation(tenantId, 'canonical-op-3', baseOperation({ customerCountry: undefined }));

    expect(result).toEqual({ status: 'DECISION_REGISTRADA', taxDecisionStatus: 'BLOQUEADA' });
    expect(create).toHaveBeenCalledWith(tenantId, expect.objectContaining({ status: 'BLOQUEADA' }));
  });

  it('omite la persistencia (sin lanzar error) cuando el tenant no tiene entidad legal configurada', async () => {
    const findFirstByTenant = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn();
    const service = new TaxDecisionService({
      legalEntitiesRepository: { findFirstByTenant },
      taxDecisionsRepository: { create },
      taxConfigurationRepository,
    });

    const result = await service.runTaxDecisionForOperation(tenantId, 'canonical-op-4', baseOperation());

    expect(result).toEqual({ status: 'EMISOR_NO_CONFIGURADO' });
    expect(create).not.toHaveBeenCalled();
  });
});
