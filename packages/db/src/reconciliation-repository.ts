import { and, count, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { commercialOrders, financialEvents, matchingCandidates } from './schema';
import * as schema from './schema';

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

export class DrizzleReconciliationRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

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
