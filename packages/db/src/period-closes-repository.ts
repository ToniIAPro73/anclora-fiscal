import { and, eq, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditEvents, canonicalOperations, issues, periodCloses } from './schema';
import * as schema from './schema';

export type PeriodClose = typeof periodCloses.$inferSelect;

const CLOSED_STATUS = 'CLOSED';
const REOPENED_STATUS = 'REOPENED_WITH_AUDIT_TRAIL';

export type ClosePeriodResult =
  | { ok: true; periodClose: PeriodClose; alreadyClosed: boolean }
  | { ok: false; reason: 'BLOCKING_ISSUES_OPEN'; issueIds: string[] };

export type ReopenPeriodResult =
  | { ok: true; periodClose: PeriodClose }
  | { ok: false; reason: 'PERIOD_NOT_CLOSED' };

export class DrizzlePeriodClosesRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Closes a fiscal period for a tenant. Rejects with `BLOCKING_ISSUES_OPEN`
   * (listing the offending issue ids) when any OPEN + BLOCKING issue is
   * linked, via `canonicalOperationId`, to a canonical operation created in
   * that period. Otherwise upserts the `periodCloses` row (status `CLOSED`,
   * `frozenAt: now()`, `approvedBy: actorId`) and inserts an `auditEvents`
   * row (`PERIOD_CLOSED`) in the same transaction. Idempotent: closing an
   * already-closed period returns the existing row unchanged, with no
   * duplicate audit event.
   */
  async close(tenantId: string, period: string, actorId: string): Promise<ClosePeriodResult> {
    return this.db.transaction(async (transaction) => {
      const blockingIssues = await transaction
        .select({ id: issues.id })
        .from(issues)
        .innerJoin(canonicalOperations, eq(issues.canonicalOperationId, canonicalOperations.id))
        .where(and(
          eq(issues.tenantId, tenantId),
          eq(issues.status, 'OPEN'),
          eq(issues.severity, 'BLOCKING'),
          eq(canonicalOperations.tenantId, tenantId),
          sql`to_char(${canonicalOperations.createdAt}, 'YYYY-MM') = ${period}`,
        ));

      if (blockingIssues.length > 0) {
        return { ok: false, reason: 'BLOCKING_ISSUES_OPEN', issueIds: blockingIssues.map((issue) => issue.id) };
      }

      const [existing] = await transaction
        .select()
        .from(periodCloses)
        .where(and(eq(periodCloses.tenantId, tenantId), eq(periodCloses.period, period)))
        .limit(1);

      if (existing && existing.status === CLOSED_STATUS) {
        return { ok: true, periodClose: existing, alreadyClosed: true };
      }

      const frozenAt = new Date();
      const periodClose = existing
        ? (await transaction
            .update(periodCloses)
            .set({ status: CLOSED_STATUS, frozenAt, approvedBy: actorId, updatedAt: frozenAt })
            .where(eq(periodCloses.id, existing.id))
            .returning())[0]
        : (await transaction
            .insert(periodCloses)
            .values({ tenantId, period, status: CLOSED_STATUS, frozenAt, approvedBy: actorId })
            .returning())[0];
      if (!periodClose) throw new Error('No se pudo cerrar el período fiscal');

      await transaction.insert(auditEvents).values({
        tenantId,
        actorId,
        action: 'PERIOD_CLOSED',
        entityType: 'PeriodClose',
        entityId: periodClose.id,
        metadata: { period },
      });

      return { ok: true, periodClose, alreadyClosed: false };
    });
  }

  /**
   * Reopens a previously closed fiscal period, tenant-scoped. Only valid
   * when the period's current status is `CLOSED` — anything else (missing,
   * already reopened) is `PERIOD_NOT_CLOSED`. Sets status to
   * `REOPENED_WITH_AUDIT_TRAIL` and inserts an `auditEvents` row
   * (`PERIOD_REOPENED`) in the same transaction. Never deletes or mutates
   * the prior close's audit history — the `PERIOD_CLOSED` audit event
   * inserted by `close()` remains untouched.
   */
  async reopen(tenantId: string, period: string, actorId: string): Promise<ReopenPeriodResult> {
    return this.db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(periodCloses)
        .where(and(eq(periodCloses.tenantId, tenantId), eq(periodCloses.period, period)))
        .limit(1);

      if (!existing || existing.status !== CLOSED_STATUS) {
        return { ok: false, reason: 'PERIOD_NOT_CLOSED' };
      }

      const [periodClose] = await transaction
        .update(periodCloses)
        .set({ status: REOPENED_STATUS, updatedAt: new Date() })
        .where(eq(periodCloses.id, existing.id))
        .returning();
      if (!periodClose) throw new Error('No se pudo reabrir el período fiscal');

      await transaction.insert(auditEvents).values({
        tenantId,
        actorId,
        action: 'PERIOD_REOPENED',
        entityType: 'PeriodClose',
        entityId: periodClose.id,
        metadata: { period },
      });

      return { ok: true, periodClose };
    });
  }
}
