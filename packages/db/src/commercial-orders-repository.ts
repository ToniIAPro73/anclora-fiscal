import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { commercialOrders, orderLines } from './schema.js';
import * as schema from './schema.js';

export type CommercialOrder = typeof commercialOrders.$inferSelect;
export type NewCommercialOrder = typeof commercialOrders.$inferInsert;
export type OrderLine = typeof orderLines.$inferSelect;
export type NewOrderLine = typeof orderLines.$inferInsert;

/**
 * One grouped Shopify order (SHOPIFY-02): the order row plus its N lines.
 * Lines carry no `commercialOrderId`/`tenantId` yet -- both are filled in by
 * `createManyWithLines` once the parent order row is resolved (existing or
 * newly inserted), same two-step shape as royalty-repository.ts's
 * statement+lines dual write.
 */
export interface NewCommercialOrderWithLines {
  order: Omit<NewCommercialOrder, 'tenantId'>;
  lines: Array<Omit<NewOrderLine, 'tenantId' | 'commercialOrderId'>>;
}

export interface CreateManyWithLinesResult {
  orders: CommercialOrder[];
  lines: OrderLine[];
}

export interface ListCommercialOrdersInput {
  tenantId: string;
  page: number;
  pageSize: number;
}

export interface PaginatedCommercialOrders {
  items: CommercialOrder[];
  page: number;
  pageSize: number;
  total: number;
}

export class DrizzleCommercialOrdersRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Inserts a commercial order for the tenant. Callers are expected to check
   * findByExternalOrderId first when idempotency on re-import matters — this
   * method does not itself dedupe, it relies on the DB unique constraint on
   * (tenantId, sourceChannel, externalOrderId) to reject true duplicates.
   */
  async create(tenantId: string, order: Omit<NewCommercialOrder, 'tenantId'>): Promise<CommercialOrder> {
    const [row] = await this.db
      .insert(commercialOrders)
      .values({ ...order, tenantId })
      .returning();
    if (!row) throw new Error('No se pudo persistir el pedido comercial');
    return row;
  }

  /**
   * Bulk-inserts commercial orders for the tenant. Duplicates (by the
   * (tenantId, sourceChannel, externalOrderId) unique constraint) are
   * silently skipped so re-importing overlapping order data across files is
   * idempotent, mirroring DrizzleFinancialEventsRepository.createMany.
   */
  async createMany(tenantId: string, orders: Array<Omit<NewCommercialOrder, 'tenantId'>>): Promise<CommercialOrder[]> {
    if (orders.length === 0) return [];
    return this.db
      .insert(commercialOrders)
      .values(orders.map((order) => ({ ...order, tenantId })))
      .onConflictDoNothing({ target: [commercialOrders.tenantId, commercialOrders.sourceChannel, commercialOrders.externalOrderId] })
      .returning();
  }

  /**
   * SHOPIFY-02: persists a grouped Shopify order (the order row + its N
   * lines) atomically per order, in one transaction. Idempotent on
   * re-import: an existing order (by `orders_external_uq`) is never
   * overwritten -- its existing row is reused as the parent for line
   * inserts. Lines are idempotent on `order_lines_external_uq`
   * (tenantId, commercialOrderId, externalLineId) via onConflictDoNothing,
   * mirroring DrizzleRoyaltyRepository.persist's statement+lines pattern.
   * Tenant-scoped exactly like create()/createMany() above.
   */
  async createManyWithLines(tenantId: string, groupedOrders: NewCommercialOrderWithLines[]): Promise<CreateManyWithLinesResult> {
    if (groupedOrders.length === 0) return { orders: [], lines: [] };

    return this.db.transaction(async (transaction) => {
      const persistedOrders: CommercialOrder[] = [];
      const persistedLines: OrderLine[] = [];

      for (const { order, lines } of groupedOrders) {
        const [existing] = await transaction
          .select()
          .from(commercialOrders)
          .where(and(
            eq(commercialOrders.tenantId, tenantId),
            eq(commercialOrders.sourceChannel, order.sourceChannel),
            eq(commercialOrders.externalOrderId, order.externalOrderId),
          ))
          .limit(1);

        // Never overwrite existing evidence on re-import -- reuse the
        // already-persisted row as the parent for any (idempotent) line
        // inserts below, rather than updating it.
        let orderRow = existing;
        if (!orderRow) {
          const [inserted] = await transaction
            .insert(commercialOrders)
            .values({ ...order, tenantId })
            .onConflictDoNothing({ target: [commercialOrders.tenantId, commercialOrders.sourceChannel, commercialOrders.externalOrderId] })
            .returning();
          orderRow = inserted;
          if (!orderRow) {
            // Concurrent insert landed first -- refetch the winner.
            const [refetched] = await transaction
              .select()
              .from(commercialOrders)
              .where(and(
                eq(commercialOrders.tenantId, tenantId),
                eq(commercialOrders.sourceChannel, order.sourceChannel),
                eq(commercialOrders.externalOrderId, order.externalOrderId),
              ))
              .limit(1);
            if (!refetched) throw new Error('No se pudo persistir el pedido comercial agrupado');
            orderRow = refetched;
          }
        }
        persistedOrders.push(orderRow);

        if (lines.length > 0) {
          const insertedLines = await transaction
            .insert(orderLines)
            .values(lines.map((line) => ({ ...line, tenantId, commercialOrderId: orderRow.id })))
            .onConflictDoNothing({ target: [orderLines.tenantId, orderLines.commercialOrderId, orderLines.externalLineId] })
            .returning();
          persistedLines.push(...insertedLines);
        }
      }

      return { orders: persistedOrders, lines: persistedLines };
    });
  }

  async findByExternalOrderId(tenantId: string, externalOrderId: string): Promise<CommercialOrder | undefined> {
    const [row] = await this.db
      .select()
      .from(commercialOrders)
      .where(and(eq(commercialOrders.tenantId, tenantId), eq(commercialOrders.externalOrderId, externalOrderId)))
      .limit(1);
    return row;
  }

  async findById(tenantId: string, id: string): Promise<CommercialOrder | undefined> {
    const [row] = await this.db
      .select()
      .from(commercialOrders)
      .where(and(eq(commercialOrders.tenantId, tenantId), eq(commercialOrders.id, id)))
      .limit(1);
    return row;
  }

  /**
   * Read-only existence check for import-preview-time dedup (Task 4.5). Returns
   * the subset of `externalOrderIds` that already exist for the tenant+channel
   * — an empty Set for a tenant with no matching rows, never an error. This is
   * a preview-time optimization layered on top of persist-time idempotency
   * (the `onConflictDoNothing` unique constraint in createMany remains the
   * source of truth for correctness).
   */
  async findExistingExternalOrderIds(tenantId: string, sourceChannel: string, externalOrderIds: string[]): Promise<Set<string>> {
    if (externalOrderIds.length === 0) return new Set();
    const rows = await this.db
      .select({ externalOrderId: commercialOrders.externalOrderId })
      .from(commercialOrders)
      .where(and(
        eq(commercialOrders.tenantId, tenantId),
        eq(commercialOrders.sourceChannel, sourceChannel),
        inArray(commercialOrders.externalOrderId, externalOrderIds),
      ));
    return new Set(rows.map((row) => row.externalOrderId));
  }

  async findPreviewByExternalOrderIds(
    tenantId: string,
    sourceChannel: string,
    externalOrderIds: string[],
  ): Promise<Array<Pick<CommercialOrder, 'externalOrderId' | 'customerName' | 'customerEmail' | 'customerAddress' | 'customerCountry' | 'customerType'>>> {
    if (externalOrderIds.length === 0) return [];
    return this.db
      .select({
        externalOrderId: commercialOrders.externalOrderId,
        customerName: commercialOrders.customerName,
        customerEmail: commercialOrders.customerEmail,
        customerAddress: commercialOrders.customerAddress,
        customerCountry: commercialOrders.customerCountry,
        customerType: commercialOrders.customerType,
      })
      .from(commercialOrders)
      .where(and(
        eq(commercialOrders.tenantId, tenantId),
        eq(commercialOrders.sourceChannel, sourceChannel),
        inArray(commercialOrders.externalOrderId, externalOrderIds),
      ));
  }

  async listByTenant(input: ListCommercialOrdersInput): Promise<PaginatedCommercialOrders> {
    const conditions = eq(commercialOrders.tenantId, input.tenantId);

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(commercialOrders)
        .where(conditions)
        .orderBy(asc(commercialOrders.commercialDate))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db
        .select({ total: count() })
        .from(commercialOrders)
        .where(conditions),
    ]);

    return { items, page: input.page, pageSize: input.pageSize, total: totalRow?.total ?? 0 };
  }
}
