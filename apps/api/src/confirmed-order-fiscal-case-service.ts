import type { CanonicalOperationDraftInput } from '@anclora/db';
import type {
  ManualIssuanceOperation,
} from './invoice-issuance-service.js';
import type {
  TaxDecisionCanonicalOperation,
} from './tax-decision-service.js';

interface Order {
  id: string;
  externalOrderId: string;
  sourceChannel: string;
  totalAmount: string | null;
  fiscalStatus: string;
  customerCountry?: string | null;
  customerType?: string | null;
  productNature?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
}

interface ShopifySalesDetail {
  eligibility: Omit<
    ManualIssuanceOperation,
    'id' | 'fiscalStatus'
  >;
}

interface Dependencies {
  commercialOrdersRepository: {
    findById(
      tenantId: string,
      id: string,
    ): Promise<Order | undefined>;
  };

  legalEntitiesRepository: {
    findFirstByTenant(
      tenantId: string,
    ): Promise<{ id: string } | undefined>;
  };

  operationsRepository: {
    create(
      tenantId: string,
      legalEntityId: string,
      draft: CanonicalOperationDraftInput,
    ): Promise<{ id: string }>;
  };

  shopifySalesRepository?: {
    getById(
      tenantId: string,
      orderId: string,
    ): Promise<ShopifySalesDetail | null>;
  };

  taxDecisionService?: {
    runTaxDecisionForOperation(
      tenantId: string,
      operationId: string,
      operation: TaxDecisionCanonicalOperation,
    ): Promise<
      | {
          status?: string;
          taxDecisionStatus?: string;
        }
      | unknown
    >;
  };

  invoiceIssuanceService?: {
    issueAutomatically(input: {
      tenantId: string;
      operation: ManualIssuanceOperation;
    }): Promise<unknown>;
  };
}

/**
 * Creates the fiscal case from confirmed commercial evidence.
 *
 * Automatic issuance is only attempted when a real Shopify sales detail can
 * provide eligibility evidence: fiscal configuration, active profile,
 * confirmed Shopify payment transaction and determined fiscal decision.
 */
export class ConfirmedOrderFiscalCaseService {
  constructor(private readonly dependencies: Dependencies) {}

  async createForConfirmedOrder(
    tenantId: string,
    commercialOrderId: string,
  ) {
    const order = await this.dependencies.commercialOrdersRepository
      .findById(tenantId, commercialOrderId);

    if (!order) {
      return { status: 'PEDIDO_NO_ENCONTRADO' } as const;
    }

    if (
      order.fiscalStatus === 'ZERO_VALUE_REVIEW'
      || Number(order.totalAmount ?? 0) === 0
    ) {
      return { status: 'REVISION_IMPORTE_CERO' } as const;
    }

    const legalEntity = await this.dependencies.legalEntitiesRepository
      .findFirstByTenant(tenantId);

    if (!legalEntity) {
      return { status: 'EMISOR_NO_CONFIGURADO' } as const;
    }

    const grossAmount = Number(order.totalAmount ?? 0);

    const operation = await this.dependencies.operationsRepository.create(
      tenantId,
      legalEntity.id,
      {
        sourceChannel: order.sourceChannel,
        sourceOrderId: order.externalOrderId,
        operationType: 'VENTA_SHOPIFY',
        operationStatus: 'PENDIENTE_DECISION_FISCAL',
        reconciliationStatus: 'EVIDENCIA_INTERNA_PENDIENTE',
        grossAmount,
        platformFeeAmount: 0,
        netAmount: grossAmount,
        currency: 'EUR',
        anomalyFlags: [],
        customerCountry: order.customerCountry,
        customerType: order.customerType,
        productNature: order.productNature,
        customerEmail: order.customerEmail,
        customerAddress: order.customerAddress,
      },
    );

    const taxDecisionResult = this.dependencies.taxDecisionService
      ? await this.dependencies.taxDecisionService
        .runTaxDecisionForOperation(
          tenantId,
          operation.id,
          {
            id: operation.id,
            sourceChannel: order.sourceChannel,
            operationType: 'VENTA_SHOPIFY',
            grossAmount,
            originalCurrency: 'EUR',
            customerCountry: order.customerCountry,
            customerType: order.customerType,
            productNature: order.productNature,
          },
        )
      : undefined;

    if (
      this.dependencies.invoiceIssuanceService
      && this.dependencies.shopifySalesRepository
      && isDeterminedTaxDecision(taxDecisionResult)
    ) {
      const detail = await this.dependencies.shopifySalesRepository.getById(
        tenantId,
        order.id,
      );

      if (detail) {
        const issuance = await this.dependencies.invoiceIssuanceService
          .issueAutomatically({
            tenantId,
            operation: {
              id: operation.id,
              fiscalStatus: order.fiscalStatus,
              ...detail.eligibility,
            },
          });

        return {
          status: 'CREADA',
          canonicalOperationId: operation.id,
          issuance,
        } as const;
      }
    }

    return {
      status: 'CREADA',
      canonicalOperationId: operation.id,
    } as const;
  }
}

function isDeterminedTaxDecision(
  result: unknown,
): result is { taxDecisionStatus: 'DETERMINADA' } {
  return Boolean(
    result
    && typeof result === 'object'
    && 'taxDecisionStatus' in result
    && result.taxDecisionStatus === 'DETERMINADA',
  );
}