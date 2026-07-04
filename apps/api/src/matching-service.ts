import { matchOrder } from '@anclora/core';
import type { CommercialEvidence, FinancialEvidence } from '@anclora/core';
import type { CanonicalOperationDraftInput } from '@anclora/db';

export interface MatchingCommercialOrder {
  id: string;
  sourceChannel: string;
  externalOrderId: string;
  checkoutReference: string | null;
}

export interface MatchingFinancialEvent {
  id: string;
  eventType: string;
  checkoutReference: string | null;
  amount: string;
  feeAmount: string;
  netAmount: string;
  currency: string;
}

export interface MatchingCommercialOrdersPort {
  findById(tenantId: string, id: string): Promise<MatchingCommercialOrder | undefined>;
}

export interface MatchingFinancialEventsPort {
  findByOrderReference(tenantId: string, orderReference: string): Promise<MatchingFinancialEvent[]>;
}

export interface MatchingOperationsPort {
  create(tenantId: string, legalEntityId: string, draft: CanonicalOperationDraftInput): Promise<{ id: string }>;
}

export interface MatchingReconciliationPort {
  createCandidates(
    tenantId: string,
    candidates: Array<{ commercialOrderId: string; financialEventId: string; confidence: number; explanation: unknown }>,
  ): Promise<void>;
}

export interface MatchingLegalEntitiesPort {
  findFirstByTenant(tenantId: string): Promise<{ id: string } | undefined>;
}

export interface MatchingServiceDependencies {
  commercialOrdersRepository: MatchingCommercialOrdersPort;
  financialEventsRepository: MatchingFinancialEventsPort;
  operationsRepository: MatchingOperationsPort;
  reconciliationRepository: MatchingReconciliationPort;
  legalEntitiesRepository: MatchingLegalEntitiesPort;
}

export type MatchingResult =
  | { status: 'MATCHED'; canonicalOperationId: string }
  | { status: 'SKIPPED_NO_LEGAL_ENTITY' }
  | { status: 'SKIPPED_ORDER_NOT_FOUND' };

/**
 * Runs matching for a single commercial order: loads the order, finds
 * financial_events for the tenant whose orderReference matches the order's
 * externalOrderId (NOT checkoutReference — Shopify orders-CSV imports never
 * populate commercial_orders.checkoutReference, see the Phase 2 plan note),
 * calls the existing pure matchOrder() unmodified, resolves the tenant's
 * legal entity, and persists one canonical_operations row plus one
 * matching_candidates row per MatchExplanation.
 */
export class MatchingService {
  constructor(private readonly dependencies: MatchingServiceDependencies) {}

  async runMatchingForOrder(tenantId: string, commercialOrderId: string): Promise<MatchingResult> {
    const order = await this.dependencies.commercialOrdersRepository.findById(tenantId, commercialOrderId);
    if (!order) return { status: 'SKIPPED_ORDER_NOT_FOUND' };

    const events = await this.dependencies.financialEventsRepository.findByOrderReference(tenantId, order.externalOrderId);

    const commercialEvidence: CommercialEvidence = {
      orderId: order.externalOrderId,
      ...(order.checkoutReference ? { checkoutId: order.checkoutReference } : {}),
    };
    const financialEvidence: FinancialEvidence[] = events.map((event) => ({
      id: event.id,
      orderId: order.externalOrderId,
      ...(event.checkoutReference ? { checkoutId: event.checkoutReference } : {}),
      type: event.eventType as FinancialEvidence['type'],
      amount: Number(event.amount),
      fee: Number(event.feeAmount),
      net: Number(event.netAmount),
      currency: event.currency,
    }));

    const draft = matchOrder(commercialEvidence, financialEvidence);

    const legalEntity = await this.dependencies.legalEntitiesRepository.findFirstByTenant(tenantId);
    if (!legalEntity) {
      // Expected state for a tenant that hasn't completed onboarding yet —
      // do not throw, just skip persisting the canonical operation.
      console.warn(
        `[matching-service] No hay entidad legal configurada para el tenant ${tenantId}; se omite la persistencia de la operación canónica del pedido ${commercialOrderId}`,
      );
      return { status: 'SKIPPED_NO_LEGAL_ENTITY' };
    }

    const operation = await this.dependencies.operationsRepository.create(tenantId, legalEntity.id, {
      sourceChannel: order.sourceChannel,
      sourceOrderId: draft.sourceOrderId,
      operationType: 'SALE',
      operationStatus: draft.status,
      reconciliationStatus: draft.reconciliationStatus,
      grossAmount: draft.grossAmount,
      platformFeeAmount: draft.platformFeeAmount,
      netAmount: draft.netAmount,
      currency: draft.currency,
      anomalyFlags: draft.anomalyFlags,
    });

    await this.dependencies.reconciliationRepository.createCandidates(
      tenantId,
      draft.matches.map((match) => ({
        commercialOrderId: order.id,
        financialEventId: match.eventId,
        confidence: match.confidence,
        explanation: { signals: match.signals },
      })),
    );

    return { status: 'MATCHED', canonicalOperationId: operation.id };
  }
}
