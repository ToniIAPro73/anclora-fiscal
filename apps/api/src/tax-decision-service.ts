import { VersionedTaxEngine } from '@anclora/tax-engine';
import type { FiscalDemoConfig, TaxContext, TaxDecision } from '@anclora/tax-engine';

/**
 * Minimal shape of a canonical operation as needed to build a TaxContext.
 * The caller (MatchingService) already holds this in memory after
 * persisting the canonical_operations row — no redundant findById needed.
 * customerCountry/customerType/productNature are the evidence fields carried
 * forward from commercial_orders (Task 3.3); they may be absent for older
 * imports, which correctly drives the engine to BLOCKED/MISSING_TAX_EVIDENCE.
 */
export interface TaxDecisionCanonicalOperation {
  id: string;
  sourceChannel: string;
  operationType: string;
  grossAmount: string | number | null;
  originalCurrency?: string | null | undefined;
  customerCountry?: string | null | undefined;
  customerType?: string | null | undefined;
  productNature?: string | null | undefined;
}

function isKnownCustomerType(value: string): value is NonNullable<TaxContext['customerType']> {
  return value === 'B2B' || value === 'B2C';
}

export interface TaxDecisionLegalEntitiesPort {
  findFirstByTenant(tenantId: string): Promise<{ id: string; countryCode: string } | undefined>;
}

/**
 * Mirrors `Omit<NewTaxDecision, 'tenantId'>` from
 * `packages/db/src/tax-decisions-repository.ts` — numeric columns are
 * strings (this schema declares no `mode: 'number'` on its `numeric()`
 * columns, matching the `String(...)` convention already used in
 * `operations-repository.ts`). Declared locally rather than imported so
 * this file has no compile-time dependency on `@anclora/db` beyond the
 * structurally-typed port below.
 */
export interface NewTaxDecisionInput {
  canonicalOperationId: string;
  status: TaxDecision['status'];
  ruleId?: string | null | undefined;
  ruleVersion?: string | null | undefined;
  taxBase?: string | null | undefined;
  taxRate?: string | null | undefined;
  taxAmount?: string | null | undefined;
  totalAmount?: string | null | undefined;
  documentType?: TaxDecision['documentType'] | undefined;
  explanation: string[];
}

export interface TaxDecisionsRepositoryPort {
  create(tenantId: string, decision: NewTaxDecisionInput): Promise<{ id: string }>;
}

export interface TaxConfigurationPort {
  getTaxEngineConfig(tenantId: string): Promise<FiscalDemoConfig | undefined>;
}

export interface TaxDecisionServiceDependencies {
  legalEntitiesRepository: TaxDecisionLegalEntitiesPort;
  taxDecisionsRepository: TaxDecisionsRepositoryPort;
  taxConfigurationRepository: TaxConfigurationPort;
}

export type TaxDecisionResult =
  | { status: 'DECISION_REGISTRADA'; taxDecisionStatus: TaxDecision['status'] }
  | { status: 'EMISOR_NO_CONFIGURADO' };

/**
 * Runs the versioned tax engine against an already-loaded canonical
 * operation and persists the resulting tax_decisions row. Resolves the
 * tenant's legal entity (reusing Phase 2's LegalEntitiesRepository as-is)
 * to determine issuerCountry. Never throws for expected "not decidable yet"
 * states (missing evidence, no applicable rule, no legal entity) — those
 * all resolve to a persisted decision with a non-DETERMINED status, except
 * the no-legal-entity case which is a non-throwing skip (nothing to attach
 * the decision to yet), same contract as MatchingService.
 */
export class TaxDecisionService {
  constructor(private readonly dependencies: TaxDecisionServiceDependencies) {}

  async runTaxDecisionForOperation(
    tenantId: string,
    canonicalOperationId: string,
    canonicalOperation: TaxDecisionCanonicalOperation,
  ): Promise<TaxDecisionResult> {
    const legalEntity = await this.dependencies.legalEntitiesRepository.findFirstByTenant(tenantId);
    if (!legalEntity) {
      console.warn(
        `[tax-decision-service] No hay entidad legal configurada para el tenant ${tenantId}; se omite la decisión fiscal de la operación ${canonicalOperationId}`,
      );
      return { status: 'EMISOR_NO_CONFIGURADO' };
    }

    const context: TaxContext = {
      issuerCountry: legalEntity.countryCode,
      channel: canonicalOperation.sourceChannel,
      operationType: canonicalOperation.operationType,
      evidence: ['import'],
    };
    if (canonicalOperation.customerCountry) context.customerCountry = canonicalOperation.customerCountry;
    if (canonicalOperation.customerType && isKnownCustomerType(canonicalOperation.customerType)) {
      context.customerType = canonicalOperation.customerType;
    }
    if (canonicalOperation.productNature) context.productNature = canonicalOperation.productNature;
    if (canonicalOperation.grossAmount != null) context.grossAmount = Number(canonicalOperation.grossAmount);
    if (canonicalOperation.originalCurrency) context.currency = canonicalOperation.originalCurrency;

    const taxConfiguration = await this.dependencies.taxConfigurationRepository.getTaxEngineConfig(tenantId);
    const decision: TaxDecision = taxConfiguration
      ? new VersionedTaxEngine(taxConfiguration).evaluate(context)
      : { status: 'BLOQUEADA', explanation: ['No existe una configuración fiscal persistida aplicable'], blockingReason: 'CONFIGURACION_FISCAL_NO_DISPONIBLE' };

    await this.dependencies.taxDecisionsRepository.create(tenantId, {
      canonicalOperationId,
      status: decision.status,
      ruleId: decision.ruleId,
      ruleVersion: decision.ruleVersion,
      taxBase: decision.taxBase !== undefined ? String(decision.taxBase) : undefined,
      taxRate: decision.rate,
      taxAmount: decision.taxAmount !== undefined ? String(decision.taxAmount) : undefined,
      totalAmount: decision.totalAmount !== undefined ? String(decision.totalAmount) : undefined,
      documentType: decision.documentType,
      explanation: decision.explanation,
    });

    return { status: 'DECISION_REGISTRADA', taxDecisionStatus: decision.status };
  }
}
