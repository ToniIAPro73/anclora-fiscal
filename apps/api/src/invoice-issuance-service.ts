import type { StoragePort } from '@anclora/core/server';

/**
 * Minimal shape of a canonical operation as needed to drive automatic
 * invoice issuance. The caller (MatchingService) already holds this in
 * memory after persisting the canonical_operations row — no redundant
 * findById needed, same pattern as TaxDecisionCanonicalOperation.
 */
export interface InvoiceIssuanceOperation {
  id: string;
  anomalyFlags: string[];
}

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
  issue(input: { tenantId: string; actorId: null; canonicalOperationId: string; storage: StoragePort }): Promise<InvoiceIssuanceIssueResult>;
  rectify(input: { tenantId: string; actorId: null; fiscalDocumentId: string; storage: StoragePort }): Promise<InvoiceIssuanceRectifyResult>;
}

export interface InvoiceIssuanceServiceDependencies {
  fiscalDocumentsRepository: InvoiceIssuanceFiscalDocumentsPort;
  storage: StoragePort;
}

const FULL_REFUND_FLAG = 'FULL_REFUND_NET_ZERO';

export type InvoiceIssuanceResult =
  | { status: 'SKIPPED'; reason: 'OPERATION_NOT_FOUND' | 'TAX_DECISION_MISSING' | 'FISCAL_CONFIGURATION_INCOMPLETE' }
  | {
      status: 'ISSUED' | 'ALREADY_ISSUED';
      documentId: string;
      rectification?: { status: 'RECTIFIED' | 'ALREADY_RECTIFIED'; documentId: string } | undefined;
    };

/**
 * Automatic, non-user-triggered invoice issuance chained onto a successful
 * match + tax decision (Phase 5b). Reuses issue()/rectify() on
 * DrizzleFiscalDocumentsRepository exactly as they exist today — no new
 * document_type, no new linkage field, no reimplementation of rectification
 * semantics.
 *
 * Refund detection: reuses the existing anomalyFlags 'FULL_REFUND_NET_ZERO'
 * signal computed by matchOrder() (packages/core/src/matching.ts). Known,
 * documented limitation: this only fires for *full* refunds (net ≈ 0) — a
 * *partial* refund nets a non-zero amount and will not set this flag, so it
 * will look like an ordinary sale and no rectifying invoice is issued
 * automatically. This is an intentional, out-of-scope gap (not a bug to work
 * around): building a percentage-based partial-refund model was not asked
 * for (YAGNI). Operations affected by this gap surface via the
 * `RECTIFICATION_REVIEW_REQUIRED` flag on the invoicing-panel UI, which keeps
 * the existing manual issue/rectify controls as a fallback.
 */
export class InvoiceIssuanceService {
  constructor(private readonly dependencies: InvoiceIssuanceServiceDependencies) {}

  async runInvoiceIssuanceForOperation(tenantId: string, operation: InvoiceIssuanceOperation): Promise<InvoiceIssuanceResult> {
    const issueResult = await this.dependencies.fiscalDocumentsRepository.issue({
      tenantId,
      actorId: null,
      canonicalOperationId: operation.id,
      storage: this.dependencies.storage,
    });

    if (!issueResult.ok || !issueResult.document) {
      // Expected states right after Task 3's BLOCKED/PENDING_TAX_REVIEW tax
      // decision outcomes, or an operation that no longer resolves for this
      // tenant — do not throw, just report a clean skip.
      return { status: 'SKIPPED', reason: issueResult.reason ?? 'OPERATION_NOT_FOUND' };
    }

    const baseStatus = issueResult.alreadyIssued ? 'ALREADY_ISSUED' as const : 'ISSUED' as const;

    if (!operation.anomalyFlags.includes(FULL_REFUND_FLAG)) {
      return { status: baseStatus, documentId: issueResult.document.id };
    }

    const rectifyResult = await this.dependencies.fiscalDocumentsRepository.rectify({
      tenantId,
      actorId: null,
      fiscalDocumentId: issueResult.document.id,
      storage: this.dependencies.storage,
    });

    if (!rectifyResult.ok || !rectifyResult.document) {
      // A refund-flagged operation whose original document can't be
      // rectified (e.g. INVALID_DOCUMENT_STATE) must not undo the
      // already-successful issue() above — report the issue outcome without
      // a rectification, non-fatal.
      return { status: baseStatus, documentId: issueResult.document.id };
    }

    return {
      status: baseStatus,
      documentId: issueResult.document.id,
      rectification: {
        status: rectifyResult.alreadyRectified ? 'ALREADY_RECTIFIED' : 'RECTIFIED',
        documentId: rectifyResult.document.id,
      },
    };
  }
}
