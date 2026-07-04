import { and, count, eq, gte } from 'drizzle-orm';
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
  royalties: RoyaltySummary;
}

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

    const [[openIssuesRow], [importsRow], reconciliationRows, [documentsRow], royalties] = await Promise.all([
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
      this.royaltyRepository.getSummary(tenantId, currentPeriodKey()),
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
      royalties,
    };
  }
}
