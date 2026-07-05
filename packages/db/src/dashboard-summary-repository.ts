import { and, count, eq, gte, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { canonicalOperations, fiscalDocuments, importJobs, issues } from './schema.js';
import * as schema from './schema.js';
import { DrizzleRoyaltyRepository, type RoyaltySummary } from './royalty-repository.js';

export interface ReconciliationStatusSummary {
  matched: number;
  unmatched: number;
  total: number;
}

export interface DashboardSummary {
  openIssuesCount: number;
  importsThisMonthCount: number;
  reconciliationStatus: ReconciliationStatusSummary;
  documentsIssuedCount: number;
  royalties: RoyaltySummary & { period: string };
  /**
   * FASE 03 nav-gating signal: true once the tenant has at least one
   * imported (IMPORTED/IMPORTED_WITH_ISSUES) shopify-payments job. apps/web
   * uses this to hide "Conciliación" until there is transaction data worth
   * reconciling (Task 3, owned by a different batch — this repository only
   * exposes the signal).
   */
  hasPayoutData: boolean;
}

const PAYOUT_IMPORTED_STATUSES = ['IMPORTED', 'IMPORTED_WITH_ISSUES'] as const;
// KNOWN GAP: import_jobs.connector_id is still populated from previewImport()'s
// internal connector id ('shopify-csv' for the Shopify Payments CSV format —
// see import-service.ts), not yet from the new FASE 03 HTTP-layer
// connectorId ('shopify-payments'). Both are matched here so nav-gating
// keeps working through the transition; once persist() threads the new
// connectorId through end-to-end, 'shopify-csv' can be dropped from this list.
const PAYOUT_CONNECTOR_IDS = ['shopify-payments', 'shopify-csv'] as const;

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function currentPeriodKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Minimal, honest dashboard-summary aggregate. `openIssuesCount` and
 * `documentsIssuedCount` will realistically be 0 today — no write-path exists
 * yet for `issues` (no issue-detection phase) or `fiscal_documents` (no
 * invoicing pipeline until Phase 3 ships tax decisions). That is correct
 * behavior, not a bug: a zero-data tenant must get a summary of real zeros,
 * never a fabricated fallback.
 */
export class DrizzleDashboardSummaryRepository<TQueryResult extends PgQueryResultHKT> {
  private readonly royaltyRepository: DrizzleRoyaltyRepository<TQueryResult>;

  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {
    this.royaltyRepository = new DrizzleRoyaltyRepository(db);
  }

  async getSummary(tenantId: string): Promise<DashboardSummary> {
    const monthStart = startOfCurrentMonth();
    const period = currentPeriodKey();

    const [[openIssuesRow], [importsRow], reconciliationRows, [documentsRow], royaltySummary, [payoutRow]] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(issues)
        .where(and(eq(issues.tenantId, tenantId), eq(issues.status, 'OPEN'))),
      this.db
        .select({ total: count() })
        .from(importJobs)
        .where(and(eq(importJobs.tenantId, tenantId), gte(importJobs.createdAt, monthStart))),
      this.db
        .select({ reconciliationStatus: canonicalOperations.reconciliationStatus, total: count() })
        .from(canonicalOperations)
        .where(eq(canonicalOperations.tenantId, tenantId))
        .groupBy(canonicalOperations.reconciliationStatus),
      this.db
        .select({ total: count() })
        .from(fiscalDocuments)
        .where(eq(fiscalDocuments.tenantId, tenantId)),
      this.royaltyRepository.getSummary(tenantId, period),
      this.db
        .select({ total: count() })
        .from(importJobs)
        .where(and(
          eq(importJobs.tenantId, tenantId),
          inArray(importJobs.connectorId, [...PAYOUT_CONNECTOR_IDS]),
          inArray(importJobs.status, [...PAYOUT_IMPORTED_STATUSES]),
        )),
    ]);

    const reconciliationStatus = reconciliationRows.reduce<ReconciliationStatusSummary>(
      (accumulator, row) => {
        if (row.reconciliationStatus === 'MATCHED') accumulator.matched += row.total;
        else accumulator.unmatched += row.total;
        accumulator.total += row.total;
        return accumulator;
      },
      { matched: 0, unmatched: 0, total: 0 },
    );

    return {
      openIssuesCount: openIssuesRow?.total ?? 0,
      importsThisMonthCount: importsRow?.total ?? 0,
      reconciliationStatus,
      documentsIssuedCount: documentsRow?.total ?? 0,
      royalties: { ...royaltySummary, period },
      hasPayoutData: (payoutRow?.total ?? 0) > 0,
    };
  }
}
