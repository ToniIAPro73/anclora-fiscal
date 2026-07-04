import { describe, expect, it, vi } from 'vitest';
import { MatchingService } from './matching-service';

const tenantId = '01977d43-75de-7000-8000-000000000010';

describe('MatchingService', () => {
  it('empareja un pedido con su evento financiero por externalOrderId == orderReference (no por checkoutReference)', async () => {
    const order = { id: 'order-1', sourceChannel: 'SHOPIFY', externalOrderId: 'AI-1001', checkoutReference: null };
    const event = {
      id: 'event-1',
      eventType: 'charge',
      checkoutReference: null,
      amount: '100.00',
      feeAmount: '2.90',
      netAmount: '97.10',
      currency: 'EUR',
    };
    const findById = vi.fn().mockResolvedValue(order);
    const findByOrderReference = vi.fn().mockResolvedValue([event]);
    const create = vi.fn().mockResolvedValue({ id: 'canonical-op-1' });
    const createCandidates = vi.fn().mockResolvedValue(undefined);
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1' });

    const service = new MatchingService({
      commercialOrdersRepository: { findById },
      financialEventsRepository: { findByOrderReference },
      operationsRepository: { create },
      reconciliationRepository: { createCandidates },
      legalEntitiesRepository: { findFirstByTenant },
    });

    const result = await service.runMatchingForOrder(tenantId, 'order-1');

    expect(findByOrderReference).toHaveBeenCalledWith(tenantId, 'AI-1001');
    expect(result).toEqual({ status: 'MATCHED', canonicalOperationId: 'canonical-op-1' });
    expect(create).toHaveBeenCalledWith(tenantId, 'legal-entity-1', expect.objectContaining({
      sourceChannel: 'SHOPIFY',
      sourceOrderId: 'AI-1001',
      operationType: 'SALE',
      reconciliationStatus: 'MATCHED',
      grossAmount: 100,
      platformFeeAmount: 2.9,
      netAmount: 100,
    }));
    expect(createCandidates).toHaveBeenCalledWith(tenantId, [
      expect.objectContaining({ commercialOrderId: 'order-1', financialEventId: 'event-1', confidence: 0.95 }),
    ]);
  });

  it('omite la persistencia (sin lanzar error) cuando el tenant no tiene entidad legal configurada', async () => {
    const order = { id: 'order-2', sourceChannel: 'SHOPIFY', externalOrderId: 'AI-2002', checkoutReference: null };
    const findById = vi.fn().mockResolvedValue(order);
    const findByOrderReference = vi.fn().mockResolvedValue([]);
    const create = vi.fn();
    const createCandidates = vi.fn();
    const findFirstByTenant = vi.fn().mockResolvedValue(undefined);

    const service = new MatchingService({
      commercialOrdersRepository: { findById },
      financialEventsRepository: { findByOrderReference },
      operationsRepository: { create },
      reconciliationRepository: { createCandidates },
      legalEntitiesRepository: { findFirstByTenant },
    });

    const result = await service.runMatchingForOrder(tenantId, 'order-2');

    expect(result).toEqual({ status: 'SKIPPED_NO_LEGAL_ENTITY' });
    expect(create).not.toHaveBeenCalled();
    expect(createCandidates).not.toHaveBeenCalled();
  });

  it('devuelve SKIPPED_ORDER_NOT_FOUND si el pedido comercial no existe para ese tenant', async () => {
    const findById = vi.fn().mockResolvedValue(undefined);
    const findByOrderReference = vi.fn();
    const create = vi.fn();
    const createCandidates = vi.fn();
    const findFirstByTenant = vi.fn();

    const service = new MatchingService({
      commercialOrdersRepository: { findById },
      financialEventsRepository: { findByOrderReference },
      operationsRepository: { create },
      reconciliationRepository: { createCandidates },
      legalEntitiesRepository: { findFirstByTenant },
    });

    const result = await service.runMatchingForOrder(tenantId, 'missing-order');

    expect(result).toEqual({ status: 'SKIPPED_ORDER_NOT_FOUND' });
    expect(findByOrderReference).not.toHaveBeenCalled();
  });

  it('invoca la decisión fiscal después de persistir la operación canónica cuando se inyecta taxDecisionService', async () => {
    const order = {
      id: 'order-3',
      sourceChannel: 'SHOPIFY',
      externalOrderId: 'AI-3003',
      checkoutReference: null,
      customerCountry: 'ES',
      customerType: 'B2C',
      productNature: 'general',
    };
    const event = {
      id: 'event-3',
      eventType: 'charge',
      checkoutReference: null,
      amount: '121.00',
      feeAmount: '3.50',
      netAmount: '117.50',
      currency: 'EUR',
    };
    const findById = vi.fn().mockResolvedValue(order);
    const findByOrderReference = vi.fn().mockResolvedValue([event]);
    const create = vi.fn().mockResolvedValue({ id: 'canonical-op-3' });
    const createCandidates = vi.fn().mockResolvedValue(undefined);
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1' });
    const runTaxDecisionForOperation = vi.fn().mockResolvedValue({ status: 'DECIDED', taxDecisionStatus: 'DETERMINED' });

    const service = new MatchingService({
      commercialOrdersRepository: { findById },
      financialEventsRepository: { findByOrderReference },
      operationsRepository: { create },
      reconciliationRepository: { createCandidates },
      legalEntitiesRepository: { findFirstByTenant },
      taxDecisionService: { runTaxDecisionForOperation },
    });

    const result = await service.runMatchingForOrder(tenantId, 'order-3');

    expect(result).toEqual({ status: 'MATCHED', canonicalOperationId: 'canonical-op-3' });
    expect(create).toHaveBeenCalledWith(tenantId, 'legal-entity-1', expect.objectContaining({
      customerCountry: 'ES',
      customerType: 'B2C',
      productNature: 'general',
    }));
    expect(runTaxDecisionForOperation).toHaveBeenCalledWith(tenantId, 'canonical-op-3', expect.objectContaining({
      id: 'canonical-op-3',
      sourceChannel: 'SHOPIFY',
      customerCountry: 'ES',
      customerType: 'B2C',
      productNature: 'general',
    }));
  });

  it('no propaga un error de taxDecisionService fuera de runMatchingForOrder (llamada no fatal)', async () => {
    const order = { id: 'order-4', sourceChannel: 'SHOPIFY', externalOrderId: 'AI-4004', checkoutReference: null };
    const event = {
      id: 'event-4',
      eventType: 'charge',
      checkoutReference: null,
      amount: '50.00',
      feeAmount: '1.00',
      netAmount: '49.00',
      currency: 'EUR',
    };
    const findById = vi.fn().mockResolvedValue(order);
    const findByOrderReference = vi.fn().mockResolvedValue([event]);
    const create = vi.fn().mockResolvedValue({ id: 'canonical-op-4' });
    const createCandidates = vi.fn().mockResolvedValue(undefined);
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1' });
    const runTaxDecisionForOperation = vi.fn().mockRejectedValue(new Error('boom'));

    const service = new MatchingService({
      commercialOrdersRepository: { findById },
      financialEventsRepository: { findByOrderReference },
      operationsRepository: { create },
      reconciliationRepository: { createCandidates },
      legalEntitiesRepository: { findFirstByTenant },
      taxDecisionService: { runTaxDecisionForOperation },
    });

    await expect(service.runMatchingForOrder(tenantId, 'order-4')).resolves.toEqual({
      status: 'MATCHED',
      canonicalOperationId: 'canonical-op-4',
    });
  });
});
