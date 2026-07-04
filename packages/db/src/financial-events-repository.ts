import { and, count, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { financialEvents } from './schema.js';
import * as schema from './schema.js';

export interface ListFinancialEventsInput {
  tenantId: string;
  page: number;
  pageSize: number;
  eventType?: string | undefined;
}

export type FinancialEvent = typeof financialEvents.$inferSelect;
export type NewFinancialEvent = typeof financialEvents.$inferInsert;

export interface PaginatedFinancialEvents {
  items: FinancialEvent[];
  page: number;
  pageSize: number;
  total: number;
}

export class DrizzleFinancialEventsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async list(input: ListFinancialEventsInput): Promise<PaginatedFinancialEvents> {
    const conditions = input.eventType
      ? and(eq(financialEvents.tenantId, input.tenantId), eq(financialEvents.eventType, input.eventType))
      : eq(financialEvents.tenantId, input.tenantId);

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(financialEvents)
        .where(conditions)
        .orderBy(desc(financialEvents.occurredAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db
        .select({ total: count() })
        .from(financialEvents)
        .where(conditions),
    ]);

    return { items, page: input.page, pageSize: input.pageSize, total: totalRow?.total ?? 0 };
  }

  /**
   * Bulk-inserts financial events for the tenant. Duplicates (by the
   * (tenantId, sourceChannel, externalEventId) unique constraint) are
   * silently skipped so re-importing the same file is idempotent.
   */
  async createMany(tenantId: string, events: Array<Omit<NewFinancialEvent, 'tenantId'>>): Promise<FinancialEvent[]> {
    if (events.length === 0) return [];
    return this.db
      .insert(financialEvents)
      .values(events.map((event) => ({ ...event, tenantId })))
      .onConflictDoNothing({ target: [financialEvents.tenantId, financialEvents.sourceChannel, financialEvents.externalEventId] })
      .returning();
  }
}
