import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { commercialOrders } from './schema.js';
import * as schema from './schema.js';

export type CommercialOrder = typeof commercialOrders.$inferSelect;
export type NewCommercialOrder = typeof commercialOrders.$inferInsert;

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
