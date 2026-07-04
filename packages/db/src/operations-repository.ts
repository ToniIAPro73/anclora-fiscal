import { and, count, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { canonicalOperations } from './schema.js';
import * as schema from './schema.js';

export interface ListOperationsInput {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: string | undefined;
}

export type Operation = typeof canonicalOperations.$inferSelect;
export type NewOperation = typeof canonicalOperations.$inferInsert;

export interface PaginatedOperations {
  items: Operation[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Draft shape produced by `matchOrder()` (packages/core/src/matching.ts),
 * mapped onto canonical_operations columns. `matchOrder()` does not itself
 * know the operation type or legal entity — callers (matching-service.ts)
 * supply those alongside the draft.
 */
export interface CanonicalOperationDraftInput {
  sourceChannel: string;
  sourceOrderId: string;
  operationType: string;
  operationStatus: string;
  reconciliationStatus: string;
  grossAmount: number;
  platformFeeAmount: number;
  netAmount: number;
  currency?: string | undefined;
  anomalyFlags: string[];
  customerCountry?: string | null | undefined;
  customerType?: string | null | undefined;
  productNature?: string | null | undefined;
}

export class DrizzleOperationsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Persists one canonical operation for the tenant, mapping a matchOrder()
   * draft onto canonical_operations columns. Upserts on
   * (tenantId, sourceChannel, sourceOrderId) — matching can be triggered more
   * than once for the same order (e.g. a refund event arriving after the
   * initial charge already produced an operation), so a repeat run must
   * update the existing row rather than insert a duplicate. reviewStatus
   * resets to PENDING and verifactuStatus resets to PENDING on every
   * (re-)match — both are advanced by later stages (tax decisioning,
   * invoicing) not built yet in this phase.
   */
  async create(tenantId: string, legalEntityId: string, draft: CanonicalOperationDraftInput): Promise<Operation> {
    const values = {
      tenantId,
      legalEntityId,
      sourceChannel: draft.sourceChannel,
      sourceOrderId: draft.sourceOrderId,
      operationType: draft.operationType,
      operationStatus: draft.operationStatus,
      originalCurrency: draft.currency,
      grossAmount: String(draft.grossAmount),
      platformFeeAmount: String(draft.platformFeeAmount),
      netAmount: String(draft.netAmount),
      reviewStatus: 'PENDING',
      reconciliationStatus: draft.reconciliationStatus,
      verifactuStatus: 'PENDING',
      anomalyFlags: draft.anomalyFlags,
      customerCountry: draft.customerCountry,
      customerType: draft.customerType,
      productNature: draft.productNature,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(canonicalOperations)
      .values(values)
      .onConflictDoUpdate({
        target: [canonicalOperations.tenantId, canonicalOperations.sourceChannel, canonicalOperations.sourceOrderId],
        set: values,
      })
      .returning();
    if (!row) throw new Error('No se pudo persistir la operación canónica');
    return row;
  }

  async list(input: ListOperationsInput): Promise<PaginatedOperations> {
    const conditions = input.status
      ? and(eq(canonicalOperations.tenantId, input.tenantId), eq(canonicalOperations.operationStatus, input.status))
      : eq(canonicalOperations.tenantId, input.tenantId);

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(canonicalOperations)
        .where(conditions)
        .orderBy(desc(canonicalOperations.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db
        .select({ total: count() })
        .from(canonicalOperations)
        .where(conditions),
    ]);

    return { items, page: input.page, pageSize: input.pageSize, total: totalRow?.total ?? 0 };
  }
}
