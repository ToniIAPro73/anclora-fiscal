import { eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import type { RoyaltyLine, RoyaltyStatement } from '@anclora/core';
import { royaltyLines, royaltyStatements } from './schema.js';
import * as schema from './schema.js';

export interface RoyaltySummary {
  statementsCount: number;
  totalThisPeriod: string;
}

export interface PersistRoyaltyStatementInput {
  tenantId: string;
  importFileId: string;
  statement: RoyaltyStatement;
  lines: RoyaltyLine[];
}

export interface PersistRoyaltyStatementResult {
  statementId: string;
  duplicate: boolean;
}

export class DrizzleRoyaltyRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Persists a KDP royalty statement and its lines. Idempotent on
   * (tenantId, statement.hash) — a re-imported file with identical bytes
   * returns the existing statement without inserting duplicate lines.
   */
  async persist(input: PersistRoyaltyStatementInput): Promise<PersistRoyaltyStatementResult> {
    const [existing] = await this.db
      .select({ id: royaltyStatements.id })
      .from(royaltyStatements)
      .where(eq(royaltyStatements.hash, input.statement.hash))
      .limit(1);
    if (existing) return { statementId: existing.id, duplicate: true };

    return this.db.transaction(async (transaction) => {
      const [statementRow] = await transaction.insert(royaltyStatements).values({
        tenantId: input.tenantId,
        importFileId: input.importFileId,
        sourceConnector: input.statement.sourceConnector,
        currency: input.statement.currency,
        periods: input.statement.periods,
        totalRoyalties: String(input.statement.totalRoyalties),
        lineCount: String(input.statement.lineCount),
        hash: input.statement.hash,
      }).returning({ id: royaltyStatements.id });
      if (!statementRow) throw new Error('No se pudo persistir el estado de regalías');

      if (input.lines.length > 0) {
        // Overlapping KDP exports (e.g. a wider-range re-download) commonly
        // repeat lines already recorded from a prior statement; businessKey
        // is stable across files for the same underlying transaction, so a
        // conflicting insert here means "already recorded" — skip it rather
        // than fail the whole import.
        await transaction.insert(royaltyLines).values(input.lines.map((line) => ({
          tenantId: input.tenantId,
          royaltyStatementId: statementRow.id,
          businessKey: line.businessKey,
          classification: line.classification,
          status: line.status,
          period: line.period,
          title: line.title,
          isbnOrAsin: line.isbnOrAsin,
          store: line.store,
          unitsSold: line.unitsSold !== undefined ? String(line.unitsSold) : undefined,
          unitsReturned: line.unitsReturned !== undefined ? String(line.unitsReturned) : undefined,
          unitsNet: line.unitsNet !== undefined ? String(line.unitsNet) : undefined,
          amount: String(line.amount),
          currency: line.currency,
          averageUnitPrice: line.averageUnitPrice !== undefined ? String(line.averageUnitPrice) : undefined,
          productionCost: line.productionCost !== undefined ? String(line.productionCost) : undefined,
          kenpPages: line.kenpPages !== undefined ? String(line.kenpPages) : undefined,
          sourceSheet: line.sourceSheet,
        }))).onConflictDoNothing({ target: [royaltyLines.tenantId, royaltyLines.businessKey] });
      }

      return { statementId: statementRow.id, duplicate: false };
    });
  }

  /**
   * Aggregate view for the dashboard-summary endpoint. `statementsCount` is
   * the tenant's total statement count ever imported; `totalThisPeriod` sums
   * `totalRoyalties` for statements whose `periods` array includes the given
   * period key (e.g. `2026-07`). Reuses the existing table shape — no new
   * columns or aggregation logic beyond a plain sum, kept in JS since the
   * per-tenant statement count is expected to stay small at this MVP stage.
   */
  async getSummary(tenantId: string, period: string): Promise<RoyaltySummary> {
    const rows = await this.db
      .select({ totalRoyalties: royaltyStatements.totalRoyalties, periods: royaltyStatements.periods })
      .from(royaltyStatements)
      .where(eq(royaltyStatements.tenantId, tenantId));

    const totalThisPeriod = rows
      .filter((row) => row.periods.includes(period))
      .reduce((sum, row) => sum + Number(row.totalRoyalties), 0);

    return { statementsCount: rows.length, totalThisPeriod: totalThisPeriod.toFixed(2) };
  }
}
