import { and, count, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditEvents, issues } from './schema.js';
import * as schema from './schema.js';

export interface ListIssuesInput {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: string | undefined;
  severity?: string | undefined;
}

export type Issue = typeof issues.$inferSelect;

export interface PaginatedIssues {
  items: Issue[];
  page: number;
  pageSize: number;
  total: number;
}

export class DrizzleIssuesRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async list(input: ListIssuesInput): Promise<PaginatedIssues> {
    const filters = [eq(issues.tenantId, input.tenantId)];
    if (input.status) filters.push(eq(issues.status, input.status));
    if (input.severity) filters.push(eq(issues.severity, input.severity));
    const conditions = filters.length > 1 ? and(...filters) : filters[0];

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(issues)
        .where(conditions)
        .orderBy(desc(issues.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db
        .select({ total: count() })
        .from(issues)
        .where(conditions),
    ]);

    return { items, page: input.page, pageSize: input.pageSize, total: totalRow?.total ?? 0 };
  }

  /**
   * Marks an issue as resolved, scoped to the given tenant. Never trusts a
   * bare `id` match — the WHERE clause always includes tenantId, and a zero
   * row count (checked via the empty `.returning()` array) is treated as a
   * 404, not an error. Idempotent: resolving an already-resolved issue still
   * matches on tenantId + id and returns the (already resolved) row with a
   * fresh audit event, rather than erroring.
   */
  async resolve(tenantId: string, issueId: string, actorId: string): Promise<Issue | null> {
    return this.db.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(issues)
        .set({ status: 'RESOLVED', updatedAt: new Date() })
        .where(and(eq(issues.tenantId, tenantId), eq(issues.id, issueId)))
        .returning();

      if (!updated) return null;

      await transaction.insert(auditEvents).values({
        tenantId,
        actorId,
        action: 'ISSUE_RESOLVED',
        entityType: 'Issue',
        entityId: issueId,
        metadata: {},
      });

      return updated;
    });
  }
}
