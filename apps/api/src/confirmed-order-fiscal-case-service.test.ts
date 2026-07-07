import { describe, expect, it, vi } from 'vitest';
import { ConfirmedOrderFiscalCaseService } from './confirmed-order-fiscal-case-service';

const tenantId = '01977d43-75de-7000-8000-000000000010';

const paidOrder = {
  id: 'order-1',
  externalOrderId: 'AI-1001',
  sourceChannel: 'SHOPIFY',
  totalAmount: '6.99',
  fiscalStatus: 'PENDING',
  customerCountry: 'ES',
  customerType: 'B2C',
  productNature: 'ebook',
  customerEmail: 'buyer@example.test',
  customerAddress: 'Calle Comprador 1',
};

describe('ConfirmedOrderFiscalCaseService', () => {
  it('crea operación fiscal Shopify con valores canónicos españoles y dispara decisión fiscal', async () => {
    const findById = vi.fn().mockResolvedValue(paidOrder);
    const findFirstByTenant = vi.fn().mockResolvedValue({ id: 'legal-entity-1' });
    const create = vi.fn().mockResolvedValue({ id: 'canonical-op-1' });
    const runTaxDecisionForOperation = vi.fn().mockResolvedValue({ status: 'DECISION_REGISTRADA', taxDecisionStatus: 'DETERMINADA' });
    const service = new ConfirmedOrderFiscalCaseService({
      commercialOrdersRepository: { findById },
      legalEntitiesRepository: { findFirstByTenant },
      operationsRepository: { create },
      taxDecisionService: { runTaxDecisionForOperation },
    });

    const result = await service.createForConfirmedOrder(tenantId, 'order-1');

    expect(result).toEqual({ status: 'CREADA', canonicalOperationId: 'canonical-op-1' });
    expect(create).toHaveBeenCalledWith(tenantId, 'legal-entity-1', expect.objectContaining({
      sourceChannel: 'SHOPIFY',
      sourceOrderId: 'AI-1001',
      operationType: 'VENTA_SHOPIFY',
      operationStatus: 'PENDIENTE_DECISION_FISCAL',
      reconciliationStatus: 'EVIDENCIA_INTERNA_PENDIENTE',
      grossAmount: 6.99,
      customerEmail: 'buyer@example.test',
      customerAddress: 'Calle Comprador 1',
    }));
    expect(runTaxDecisionForOperation).toHaveBeenCalledWith(tenantId, 'canonical-op-1', expect.objectContaining({
      operationType: 'VENTA_SHOPIFY',
      customerCountry: 'ES',
      customerType: 'B2C',
      productNature: 'ebook',
    }));
  });

  it('deriva pedidos de importe cero a revisión sin crear operación', async () => {
    const create = vi.fn();
    const service = new ConfirmedOrderFiscalCaseService({
      commercialOrdersRepository: { findById: vi.fn().mockResolvedValue({ ...paidOrder, totalAmount: '0.00', fiscalStatus: 'ZERO_VALUE_REVIEW' }) },
      legalEntitiesRepository: { findFirstByTenant: vi.fn() },
      operationsRepository: { create },
    });

    await expect(service.createForConfirmedOrder(tenantId, 'order-1')).resolves.toEqual({ status: 'REVISION_IMPORTE_CERO' });
    expect(create).not.toHaveBeenCalled();
  });
});
