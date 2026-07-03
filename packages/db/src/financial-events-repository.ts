import { and, count, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { financialEvents } from './schema';
import * as schema from './schema';

export interface ListFinancialEventsInput {
  tenantId: string;
  page: number;
  pageSize: number;
  eventType?: string | undefined;
}

export type FinancialEvent = typeof financialEvents.$inferSelect;

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
}
