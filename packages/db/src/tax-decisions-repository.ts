import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { taxDecisions } from './schema.js';
import * as schema from './schema.js';

export type TaxDecisionRow = typeof taxDecisions.$inferSelect;
export type NewTaxDecision = typeof taxDecisions.$inferInsert;

/**
 * Minimal write repository for tax decisions. `fiscal-documents-repository.ts`
 * already reads `tax_decisions` correctly via its own raw Drizzle select
 * (tenant + canonicalOperationId scoped, most-recent-first) — no read/list
 * method is needed here (YAGNI). Single-purpose, minimal, following the exact
 * pattern in `legal-entities-repository.ts`.
 */
export class DrizzleTaxDecisionsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async create(tenantId: string, decision: Omit<NewTaxDecision, 'tenantId'>): Promise<TaxDecisionRow> {
    const [row] = await this.db
      .insert(taxDecisions)
      .values({ ...decision, tenantId })
      .returning();
    if (!row) throw new Error('No se pudo persistir la decisión fiscal');
    return row;
  }
}
