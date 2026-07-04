import { and, count, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { commercialOrders, financialEvents, matchingCandidates } from './schema.js';
import * as schema from './schema.js';

export interface ListReconciliationCandidatesInput {
  tenantId: string;
  page: number;
  pageSize: number;
  accepted?: boolean | undefined;
}

export type ReconciliationCandidate = {
  id: string;
  tenantId: string;
  commercialOrderId: string;
  financialEventId: string;
  confidence: string;
  accepted: boolean;
  commercialOrderExternalId: string;
  financialEventExternalId: string;
};

export interface PaginatedReconciliationCandidates {
  items: ReconciliationCandidate[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NewMatchingCandidateInput {
  commercialOrderId: string;
  financialEventId: string;
  confidence: number;
  explanation: unknown;
}

export class DrizzleReconciliationRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Bulk-inserts matching candidates for the tenant — one row per
   * MatchExplanation produced by matchOrder() (packages/core/src/matching.ts).
   * Matching can be re-triggered for the same order (e.g. a later event
   * arriving after an earlier match), so a repeat run's candidates are
   * deduped on (tenantId, commercialOrderId, financialEventId) rather than
   * inserted again.
   */
  async createCandidates(tenantId: string, candidates: NewMatchingCandidateInput[]): Promise<void> {
    if (candidates.length === 0) return;
    await this.db.insert(matchingCandidates).values(
      candidates.map((candidate) => ({
        tenantId,
        commercialOrderId: candidate.commercialOrderId,
        financialEventId: candidate.financialEventId,
        confidence: String(candidate.confidence),
        explanation: candidate.explanation,
      })),
    ).onConflictDoNothing({
      target: [matchingCandidates.tenantId, matchingCandidates.commercialOrderId, matchingCandidates.financialEventId],
    });
  }

  async list(input: ListReconciliationCandidatesInput): Promise<PaginatedReconciliationCandidates> {
    const conditions = input.accepted !== undefined
      ? and(eq(matchingCandidates.tenantId, input.tenantId), eq(matchingCandidates.accepted, input.accepted))
      : eq(matchingCandidates.tenantId, input.tenantId);

    const selection = {
      id: matchingCandidates.id,
      tenantId: matchingCandidates.tenantId,
      commercialOrderId: matchingCandidates.commercialOrderId,
      financialEventId: matchingCandidates.financialEventId,
      confidence: matchingCandidates.confidence,
      accepted: matchingCandidates.accepted,
      commercialOrderExternalId: commercialOrders.externalOrderId,
      financialEventExternalId: financialEvents.externalEventId,
    };

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select(selection)
        .from(matchingCandidates)
        .innerJoin(commercialOrders, eq(matchingCandidates.commercialOrderId, commercialOrders.id))
        .innerJoin(financialEvents, eq(matchingCandidates.financialEventId, financialEvents.id))
        .where(conditions)
        .orderBy(desc(matchingCandidates.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db
        .select({ total: count() })
        .from(matchingCandidates)
        .where(conditions),
    ]);

    return { items, page: input.page, pageSize: input.pageSize, total: totalRow?.total ?? 0 };
  }
}
