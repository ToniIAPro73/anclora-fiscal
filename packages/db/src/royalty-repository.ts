import { and, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { summarizeRoyaltyAdvisory, type ExchangeRateSnapshot, type RoyaltyLine, type RoyaltyStatement } from '@anclora/core';
import { royaltyExchangeRates, royaltyLines, royaltyStatements } from './schema.js';
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
   * Read-only existence check for import-preview-time dedup (Task 4.5).
   * Returns the subset of `businessKeys` already recorded for the tenant —
   * an empty Set for a tenant with no matching rows, never an error.
   * Persist-time idempotency (persist()'s onConflictDoNothing) remains the
   * source of truth; this is a preview-time filter layered on top.
   */
  async findExistingBusinessKeys(tenantId: string, businessKeys: string[]): Promise<Set<string>> {
    if (businessKeys.length === 0) return new Set();
    const rows = await this.db
      .select({ businessKey: royaltyLines.businessKey })
      .from(royaltyLines)
      .where(and(eq(royaltyLines.tenantId, tenantId), inArray(royaltyLines.businessKey, businessKeys)));
    return new Set(rows.map((row) => row.businessKey));
  }

  /**
   * Aggregate view for the dashboard-summary endpoint. `statementsCount` is
   * the tenant's total statement count ever imported; `totalThisPeriod` sums
   * `totalRoyalties` for statements whose `periods` array includes the given
   * period key (e.g. `2026-07`). Reuses the existing table shape — no new
   * columns or aggregation logic beyond a plain sum, kept in JS since the
   * per-tenant statement count is expected to stay small at this MVP stage.
   */
  async saveExchangeRate(tenantId: string, rate: ExchangeRateSnapshot): Promise<void> {
    await this.db.insert(royaltyExchangeRates).values({ tenantId, source: rate.source, rateDate: rate.date, baseCurrency: rate.base, quoteCurrency: rate.quote, rate: String(rate.rate) }).onConflictDoNothing();
  }

  async getAdvisoryAnalytics(tenantId: string, period: string) {
    const [lines, rates] = await Promise.all([this.db.select().from(royaltyLines).where(and(eq(royaltyLines.tenantId, tenantId), eq(royaltyLines.period, period))), this.db.select().from(royaltyExchangeRates).where(eq(royaltyExchangeRates.tenantId, tenantId))]);
    return summarizeRoyaltyAdvisory(lines.map((row) => ({ businessKey: row.businessKey, classification: row.classification as RoyaltyLine['classification'], status: row.status as RoyaltyLine['status'], period: row.period, isbnOrAsin: row.isbnOrAsin, ...(row.store ? { store: row.store } : {}), amount: Number(row.amount), currency: row.currency, ...(row.productionCost === null ? {} : { productionCost: Number(row.productionCost) }), sourceSheet: row.sourceSheet, ...(row.classification === 'ebook' || row.classification === 'impreso' ? { format: row.classification } : {}) })), rates.map((row) => ({ source: row.source, date: row.rateDate, base: row.baseCurrency, quote: 'EUR' as const, rate: Number(row.rate) })));
  }

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
