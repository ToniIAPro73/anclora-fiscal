import { can, type Role } from '@anclora/core';
import type { StoragePort } from '@anclora/core/server';

/** Permission checked against `packages/core/src/index.ts`'s `permissions` map — currently granted to FISCAL_OPERATOR and ADMIN (via '*'), not to REVIEWER or ADVISOR_READONLY. */
const ISSUE_PERMISSION = 'documents:issue';

/** Zero-amount rows must never be issued, manually or automatically. */
export const ZERO_VALUE_REVIEW_FISCAL_STATUS = 'ZERO_VALUE_REVIEW';
export const REVISION_IMPORTE_CERO_FISCAL_STATUS = 'REVISION_IMPORTE_CERO';

/**
 * Mirrors the relevant subset of IssueInvoiceResult/RectifyInvoiceResult
 * from packages/db/src/fiscal-documents-repository.ts, declared locally so
 * this file has no compile-time dependency on @anclora/db beyond the
 * structurally-typed port below (same convention as tax-decision-service.ts).
 */
export interface InvoiceIssuanceIssueResult {
  ok: boolean;
  document?: { id: string };
  reason?: 'OPERATION_NOT_FOUND' | 'TAX_DECISION_MISSING' | 'FISCAL_CONFIGURATION_INCOMPLETE';
  alreadyIssued?: boolean;
}

export interface InvoiceIssuanceRectifyResult {
  ok: boolean;
  document?: { id: string };
  reason?: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE';
  alreadyRectified?: boolean;
}

export interface InvoiceIssuanceFiscalDocumentsPort {
  issue(input: { tenantId: string; actorId: string | null; canonicalOperationId: string; storage: StoragePort }): Promise<InvoiceIssuanceIssueResult>;
  rectify(input: { tenantId: string; actorId: string | null; fiscalDocumentId: string; storage: StoragePort }): Promise<InvoiceIssuanceRectifyResult>;
}

export interface InvoiceIssuanceServiceDependencies {
  fiscalDocumentsRepository: InvoiceIssuanceFiscalDocumentsPort;
  storage: StoragePort;
}

/**
 * Snapshot of the checks the caller (the /sales/shopify/[orderId] detail
 * route, per Task 3) must gather before requesting manual issuance —
 * config, fiscal profile, the SHOPIFY-03 evidence chain (order + order
 * transactions + payments ledger), and a determined tax decision.
 */
export interface ManualIssuanceOperation {
  id: string;
  fiscalStatus: string;
  hasFiscalConfiguration: boolean;
  hasFiscalProfile: boolean;
  hasOrderEvidence: boolean;
  hasTransactionsEvidence: boolean;
  hasLedgerEvidence?: boolean;
  hasTaxDecision: boolean;
}

export type ManualIssuanceGateReason =
  | 'ROLE_NOT_AUTHORIZED'
  | 'ZERO_VALUE_REVIEW_EXCLUDED'
  | 'FISCAL_CONFIGURATION_INCOMPLETE'
  | 'FISCAL_PROFILE_MISSING'
  | 'INSUFFICIENT_EVIDENCE'
  | 'TAX_DECISION_MISSING';

export type ManualIssuanceGateResult = { allowed: true } | { allowed: false; reason: ManualIssuanceGateReason };

/**
 * Pure gate function (no I/O) so the /sales/shopify/[orderId] detail page
 * (Task 3) can reuse it to disable/hide the "issue" button with the same
 * reason the backend would enforce, without duplicating the rule set.
 * Order of checks is deliberate: role first (cheapest, no evidence needed),
 * then the hard exclusion, then progressively more specific missing-evidence
 * reasons.
 */
export function evaluateManualIssuanceGate(role: Role, operation: ManualIssuanceOperation): ManualIssuanceGateResult {
  if (!can(role, ISSUE_PERMISSION)) return { allowed: false, reason: 'ROLE_NOT_AUTHORIZED' };
  return evaluateFiscalIssuancePolicy(operation);
}

export function evaluateFiscalIssuancePolicy(operation: ManualIssuanceOperation): ManualIssuanceGateResult {
  if (operation.fiscalStatus === ZERO_VALUE_REVIEW_FISCAL_STATUS || operation.fiscalStatus === REVISION_IMPORTE_CERO_FISCAL_STATUS) {
    return { allowed: false, reason: 'ZERO_VALUE_REVIEW_EXCLUDED' };
  }
  if (!operation.hasFiscalConfiguration) return { allowed: false, reason: 'FISCAL_CONFIGURATION_INCOMPLETE' };
  if (!operation.hasFiscalProfile) return { allowed: false, reason: 'FISCAL_PROFILE_MISSING' };
  if (!operation.hasOrderEvidence || !operation.hasTransactionsEvidence) {
    return { allowed: false, reason: 'INSUFFICIENT_EVIDENCE' };
  }
  if (!operation.hasTaxDecision) return { allowed: false, reason: 'TAX_DECISION_MISSING' };
  return { allowed: true };
}

export type ManualIssuanceResult =
  | { status: 'BLOCKED'; reason: ManualIssuanceGateReason }
  | { status: 'ISSUE_FAILED'; reason: 'OPERATION_NOT_FOUND' | 'TAX_DECISION_MISSING' | 'FISCAL_CONFIGURATION_INCOMPLETE' }
  | { status: 'ISSUED' | 'ALREADY_ISSUED'; documentId: string };

export interface RefundOperation {
  id: string;
  existingFiscalDocumentId: string | null;
}

export type RefundBranchResult =
  | { status: 'ROUTED_TO_REVIEW'; operationId: string }
  | { status: 'RECTIFICATION_FAILED'; reason: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE' }
  | { status: 'RECTIFIED' | 'ALREADY_RECTIFIED'; documentId: string };

/**
 * SHOPIFY-06: explicit, user-triggered issuance/refund-branching action.
 * Replaces the prior automatic-on-match issuance
 * (`runInvoiceIssuanceForOperation`, chained non-fatally from
 * MatchingService in Phase 5b). That automatic path is removed outright
 * rather than repaired: MatchingService's `invoiceIssuanceService`
 * dependency was already marked `@deprecated` and never actually invoked in
 * production (see matching-service.ts — `runMatchingForOrder` never reads
 * it), so removing it changes no observed runtime behavior, only deletes
 * dead code and replaces it with the real gated action the plan asks for.
 */
export class InvoiceIssuanceService {
  constructor(private readonly dependencies: InvoiceIssuanceServiceDependencies) {}

  /**
   * Manual issuance: gated on role (documents:issue), ZERO_VALUE_REVIEW
   * exclusion, minimum fiscal configuration, fiscal profile, sufficient
   * evidence (order + transactions + ledger), and a determined tax
   * decision. Only once every check passes does this delegate to
   * fiscalDocumentsRepository.issue(), which independently re-verifies
   * config/tax-decision state server-side (defense in depth — the gate
   * above must never be the only check).
   */
  async issueManually(request: {
    tenantId: string;
    actorId: string;
    role: Role;
    operation: ManualIssuanceOperation;
  }): Promise<ManualIssuanceResult> {
    const gate = evaluateManualIssuanceGate(request.role, request.operation);
    if (!gate.allowed) return { status: 'BLOCKED', reason: gate.reason };

    const issueResult = await this.dependencies.fiscalDocumentsRepository.issue({
      tenantId: request.tenantId,
      actorId: request.actorId,
      canonicalOperationId: request.operation.id,
      storage: this.dependencies.storage,
    });

    if (!issueResult.ok || !issueResult.document) {
      return { status: 'ISSUE_FAILED', reason: issueResult.reason ?? 'OPERATION_NOT_FOUND' };
    }

    return {
      status: issueResult.alreadyIssued ? 'ALREADY_ISSUED' : 'ISSUED',
      documentId: issueResult.document.id,
    };
  }

  async issueAutomatically(request: {
    tenantId: string;
    operation: ManualIssuanceOperation;
  }): Promise<ManualIssuanceResult> {
    const gate = evaluateFiscalIssuancePolicy(request.operation);
    if (!gate.allowed) return { status: 'BLOCKED', reason: gate.reason };

    const issueResult = await this.dependencies.fiscalDocumentsRepository.issue({
      tenantId: request.tenantId,
      actorId: null,
      canonicalOperationId: request.operation.id,
      storage: this.dependencies.storage,
    });

    if (!issueResult.ok || !issueResult.document) {
      return { status: 'ISSUE_FAILED', reason: issueResult.reason ?? 'OPERATION_NOT_FOUND' };
    }

    return {
      status: issueResult.alreadyIssued ? 'ALREADY_ISSUED' : 'ISSUED',
      documentId: issueResult.document.id,
    };
  }

  /**
   * Refund branching: a refund against an order whose invoice was already
   * issued produces a linked rectification proposal via the existing
   * rectify() semantics — a new document is created, the original is never
   * edited (see DrizzleFiscalDocumentsRepository.rectify). A refund with no
   * prior invoice has nothing to rectify against, so it is routed to an
   * incidence/review queue rather than silently dropped or auto-issued.
   */
  async handleRefund(request: {
    tenantId: string;
    actorId: string;
    operation: RefundOperation;
  }): Promise<RefundBranchResult> {
    if (!request.operation.existingFiscalDocumentId) {
      return { status: 'ROUTED_TO_REVIEW', operationId: request.operation.id };
    }

    const rectifyResult = await this.dependencies.fiscalDocumentsRepository.rectify({
      tenantId: request.tenantId,
      actorId: request.actorId,
      fiscalDocumentId: request.operation.existingFiscalDocumentId,
      storage: this.dependencies.storage,
    });

    if (!rectifyResult.ok || !rectifyResult.document) {
      return { status: 'RECTIFICATION_FAILED', reason: rectifyResult.reason ?? 'INVALID_DOCUMENT_STATE' };
    }

    return {
      status: rectifyResult.alreadyRectified ? 'ALREADY_RECTIFIED' : 'RECTIFIED',
      documentId: rectifyResult.document.id,
    };
  }
}
