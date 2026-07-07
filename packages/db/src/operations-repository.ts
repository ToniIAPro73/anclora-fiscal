import { and, count, desc, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { canonicalOperations, commercialOrders, fiscalDocuments } from './schema.js';
import * as schema from './schema.js';

export interface ListOperationsInput {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  productNature?: string | undefined;
  sourceChannel?: string | undefined;
}

export type Operation = typeof canonicalOperations.$inferSelect;
export type NewOperation = typeof canonicalOperations.$inferInsert;

export type OperationListItem = Operation & {
  customerName: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  customerCountry: string | null;
  customerType: string | null;
  discountCode: string | null;
  discountAmount: string | null;
  issuedInvoiceId: string | null;
  issuedInvoiceNumber: string | null;
  issuedInvoiceTotalAmount: string | null;
  issuedInvoiceCurrency: string | null;
};

export interface PaginatedOperations {
  items: OperationListItem[];
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
  customerEmail?: string | null | undefined;
  customerAddress?: string | null | undefined;
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
   * resets reviewStatus and verifactuStatus on every
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
      reviewStatus: 'PENDIENTE',
      reconciliationStatus: draft.reconciliationStatus,
      verifactuStatus: 'NO_CONFIGURADO',
      anomalyFlags: draft.anomalyFlags,
      customerCountry: draft.customerCountry,
      customerType: draft.customerType,
      productNature: draft.productNature,
      customerEmail: draft.customerEmail,
      customerAddress: draft.customerAddress,
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
    const conditions = and(
      eq(canonicalOperations.tenantId, input.tenantId),
      input.status ? eq(canonicalOperations.operationStatus, input.status) : undefined,
      input.productNature ? eq(canonicalOperations.productNature, input.productNature) : undefined,
      input.sourceChannel ? eq(canonicalOperations.sourceChannel, input.sourceChannel) : undefined,
      input.dateFrom ? gte(commercialOrders.commercialDate, input.dateFrom) : undefined,
      input.dateTo ? lte(commercialOrders.commercialDate, input.dateTo) : undefined,
    );

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(canonicalOperations),
          customerName: commercialOrders.customerName,
          customerEmail: commercialOrders.customerEmail,
          customerAddress: commercialOrders.customerAddress,
          customerCountry: commercialOrders.customerCountry,
          customerType: commercialOrders.customerType,
          discountCode: commercialOrders.discountCode,
          discountAmount: commercialOrders.discountAmount,
          issuedInvoiceId: sql<string | null>`(
            select fd.id
            from ${fiscalDocuments} fd
            where fd.tenant_id = ${canonicalOperations.tenantId}
              and fd.canonical_operation_id = ${canonicalOperations.id}
              and fd.document_type = 'FULL_INVOICE'
            order by fd.issued_at desc
            limit 1
          )`,
          issuedInvoiceNumber: sql<string | null>`(
            select fd.number
            from ${fiscalDocuments} fd
            where fd.tenant_id = ${canonicalOperations.tenantId}
              and fd.canonical_operation_id = ${canonicalOperations.id}
              and fd.document_type = 'FULL_INVOICE'
            order by fd.issued_at desc
            limit 1
          )`,
          issuedInvoiceTotalAmount: sql<string | null>`(
            select fd.total_amount
            from ${fiscalDocuments} fd
            where fd.tenant_id = ${canonicalOperations.tenantId}
              and fd.canonical_operation_id = ${canonicalOperations.id}
              and fd.document_type = 'FULL_INVOICE'
            order by fd.issued_at desc
            limit 1
          )`,
          issuedInvoiceCurrency: sql<string | null>`(
            select fd.currency
            from ${fiscalDocuments} fd
            where fd.tenant_id = ${canonicalOperations.tenantId}
              and fd.canonical_operation_id = ${canonicalOperations.id}
              and fd.document_type = 'FULL_INVOICE'
            order by fd.issued_at desc
            limit 1
          )`,
        })
        .from(canonicalOperations)
        .leftJoin(commercialOrders, and(
          eq(commercialOrders.tenantId, canonicalOperations.tenantId),
          eq(commercialOrders.sourceChannel, canonicalOperations.sourceChannel),
          eq(commercialOrders.externalOrderId, canonicalOperations.sourceOrderId),
        ))
        .where(conditions)
        .orderBy(desc(canonicalOperations.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db
        .select({ total: count() })
        .from(canonicalOperations)
        .leftJoin(commercialOrders, and(
          eq(commercialOrders.tenantId, canonicalOperations.tenantId),
          eq(commercialOrders.sourceChannel, canonicalOperations.sourceChannel),
          eq(commercialOrders.externalOrderId, canonicalOperations.sourceOrderId),
        ))
        .where(conditions),
    ]);

    return { items, page: input.page, pageSize: input.pageSize, total: totalRow?.total ?? 0 };
  }
}
