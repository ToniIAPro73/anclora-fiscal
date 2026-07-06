import { and, asc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { shopifyOrderPaymentEvents } from './schema.js';
import * as schema from './schema.js';

export type ShopifyOrderPaymentEvent = typeof shopifyOrderPaymentEvents.$inferSelect;
export type NewShopifyOrderPaymentEvent = typeof shopifyOrderPaymentEvents.$inferInsert;

/**
 * SHOPIFY-03: order-level payment-transaction evidence (sale/refund/
 * authorization/capture/void). `shopifyOrderId` (the raw numeric Shopify
 * "Order" value) is stored for evidence only -- it carries no FK meaning
 * (see migration 0014's linkage-field note). `shopifyOrderName` is the real
 * join key against commercialOrders.externalOrderId; resolving
 * `commercialOrderId` from it is the caller's responsibility (via
 * CommercialOrdersRepositoryPort.findByExternalOrderId at confirm time) --
 * this repository accepts whatever `commercialOrderId` (nullable) it's given.
 */
export class DrizzleShopifyOrderPaymentEventsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Idempotent bulk insert keyed on (tenantId, externalEventKey) -- a
   * re-imported file with identical rows produces no duplicates. Two refunds
   * on distinct dates for the same order carry distinct businessKeys (date
   * is part of the connector's hash input) and are never deduped together.
   */
  async createMany(tenantId: string, importFileId: string, rows: Array<Omit<NewShopifyOrderPaymentEvent, 'tenantId' | 'importFileId'>>): Promise<ShopifyOrderPaymentEvent[]> {
    if (rows.length === 0) return [];
    return this.db
      .insert(shopifyOrderPaymentEvents)
      .values(rows.map((row) => ({ ...row, tenantId, importFileId })))
      .onConflictDoNothing({ target: [shopifyOrderPaymentEvents.tenantId, shopifyOrderPaymentEvents.externalEventKey] })
      .returning();
  }

  /** Tenant-scoped lookup by the real join key (shopifyOrderName). */
  async findByTenantAndOrder(tenantId: string, shopifyOrderName: string): Promise<ShopifyOrderPaymentEvent[]> {
    return this.db
      .select()
      .from(shopifyOrderPaymentEvents)
      .where(and(eq(shopifyOrderPaymentEvents.tenantId, tenantId), eq(shopifyOrderPaymentEvents.shopifyOrderName, shopifyOrderName)))
      .orderBy(asc(shopifyOrderPaymentEvents.occurredAt));
  }

  async findPaginated(tenantId: string, input: { limit: number; offset: number }): Promise<ShopifyOrderPaymentEvent[]> {
    return this.db
      .select()
      .from(shopifyOrderPaymentEvents)
      .where(eq(shopifyOrderPaymentEvents.tenantId, tenantId))
      .orderBy(asc(shopifyOrderPaymentEvents.occurredAt))
      .limit(input.limit)
      .offset(input.offset);
  }
}
