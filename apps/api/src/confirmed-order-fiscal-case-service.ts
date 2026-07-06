import type { CanonicalOperationDraftInput } from '@anclora/db';
import type { TaxDecisionCanonicalOperation } from './tax-decision-service.js';

interface Order { id: string; externalOrderId: string; sourceChannel: string; totalAmount: string | null; fiscalStatus: string; customerCountry?: string | null; customerType?: string | null; productNature?: string | null; customerEmail?: string | null; customerAddress?: string | null; }
interface Dependencies {
  commercialOrdersRepository: { findById(tenantId: string, id: string): Promise<Order | undefined> };
  legalEntitiesRepository: { findFirstByTenant(tenantId: string): Promise<{ id: string } | undefined> };
  operationsRepository: { create(tenantId: string, legalEntityId: string, draft: CanonicalOperationDraftInput): Promise<{ id: string }> };
  taxDecisionService?: { runTaxDecisionForOperation(tenantId: string, operationId: string, operation: TaxDecisionCanonicalOperation): Promise<unknown> };
}

/** Creates the fiscal case from confirmed commercial evidence; matching and bank evidence are not prerequisites. */
export class ConfirmedOrderFiscalCaseService {
  constructor(private readonly dependencies: Dependencies) {}
  async createForConfirmedOrder(tenantId: string, commercialOrderId: string) {
    const order = await this.dependencies.commercialOrdersRepository.findById(tenantId, commercialOrderId);
    if (!order) return { status: 'SKIPPED_ORDER_NOT_FOUND' } as const;
    if (order.fiscalStatus === 'ZERO_VALUE_REVIEW' || Number(order.totalAmount ?? 0) === 0) return { status: 'SKIPPED_ZERO_VALUE_REVIEW' } as const;
    const legalEntity = await this.dependencies.legalEntitiesRepository.findFirstByTenant(tenantId);
    if (!legalEntity) return { status: 'SKIPPED_NO_LEGAL_ENTITY' } as const;
    const grossAmount = Number(order.totalAmount ?? 0);
    const operation = await this.dependencies.operationsRepository.create(tenantId, legalEntity.id, {
      sourceChannel: order.sourceChannel, sourceOrderId: order.externalOrderId, operationType: 'SALE', operationStatus: 'PENDING_TAX_REVIEW', reconciliationStatus: 'EVIDENCE_PENDING', grossAmount, platformFeeAmount: 0, netAmount: grossAmount, currency: 'EUR', anomalyFlags: [], customerCountry: order.customerCountry, customerType: order.customerType, productNature: order.productNature, customerEmail: order.customerEmail, customerAddress: order.customerAddress,
    });
    if (this.dependencies.taxDecisionService) await this.dependencies.taxDecisionService.runTaxDecisionForOperation(tenantId, operation.id, { id: operation.id, sourceChannel: order.sourceChannel, operationType: 'SALE', grossAmount, originalCurrency: 'EUR', customerCountry: order.customerCountry, customerType: order.customerType, productNature: order.productNature });
    return { status: 'CREATED', canonicalOperationId: operation.id } as const;
  }
}
