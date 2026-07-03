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

export interface PaginatedOperations {
  items: Operation[];
  page: number;
  pageSize: number;
  total: number;
}

export class DrizzleOperationsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

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
