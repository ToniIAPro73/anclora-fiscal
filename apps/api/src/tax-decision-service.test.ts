import { describe, expect, it, vi } from 'vitest';
import { TaxDecisionService } from './tax-decision-service';

const tenantId = '01977d43-75de-7000-8000-000000000010';
const persistedTaxConfig = { id: 'TENANT_CONFIG', version: '2026-01-01', effectiveFrom: '2026-01-01', issuerCountry: 'ES', rates: [{ id: 'ES_GENERAL_21', rate: 0.21, productNature: 'general', customerCountry: 'ES' }, { id: 'ES_EBOOK_4', rate: 0.04, productNature: 'ebook', customerCountry: 'ES' }], marketplaceRoyaltyExemptRate: 0, sources: [] };
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
    productNature: 'general',
    ...overrides,
  };
}

describe('TaxDecisionService', () => {
  it('determina el tipo general del 21% para un pedido B2C español', async () => {
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1', countryCode: 'ES' });
    const create = vi.fn().mockResolvedValue({ id: 'tax-decision-1' });
    const service = new TaxDecisionService({
      legalEntitiesRepository: { findFirstByTenant },
      taxDecisionsRepository: { create },
      taxConfigurationRepository,
    });

    const result = await service.runTaxDecisionForOperation(tenantId, 'canonical-op-1', baseOperation());

    expect(result).toEqual({ status: 'DECIDED', taxDecisionStatus: 'DETERMINED' });
    expect(create).toHaveBeenCalledWith(tenantId, expect.objectContaining({
      canonicalOperationId: 'canonical-op-1',
      status: 'DETERMINED',
      taxRate: '0.21',
    }));
  });

  it('marca PENDING_TAX_REVIEW para un pedido B2C fuera de España', async () => {
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1', countryCode: 'ES' });
    const create = vi.fn().mockResolvedValue({ id: 'tax-decision-2' });
    const service = new TaxDecisionService({
      legalEntitiesRepository: { findFirstByTenant },
      taxDecisionsRepository: { create },
      taxConfigurationRepository,
    });

    const result = await service.runTaxDecisionForOperation(tenantId, 'canonical-op-2', baseOperation({ customerCountry: 'FR' }));

    expect(result).toEqual({ status: 'DECIDED', taxDecisionStatus: 'PENDING_TAX_REVIEW' });
    expect(create).toHaveBeenCalledWith(tenantId, expect.objectContaining({ status: 'PENDING_TAX_REVIEW' }));
  });

  it('marca BLOCKED por evidencia fiscal faltante cuando falta el país del cliente', async () => {
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1', countryCode: 'ES' });
    const create = vi.fn().mockResolvedValue({ id: 'tax-decision-3' });
    const service = new TaxDecisionService({
      legalEntitiesRepository: { findFirstByTenant },
      taxDecisionsRepository: { create },
      taxConfigurationRepository,
    });

    const result = await service.runTaxDecisionForOperation(tenantId, 'canonical-op-3', baseOperation({ customerCountry: undefined }));

    expect(result).toEqual({ status: 'DECIDED', taxDecisionStatus: 'BLOCKED' });
    expect(create).toHaveBeenCalledWith(tenantId, expect.objectContaining({ status: 'BLOCKED' }));
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

    expect(result).toEqual({ status: 'SKIPPED_NO_LEGAL_ENTITY' });
    expect(create).not.toHaveBeenCalled();
  });
});
