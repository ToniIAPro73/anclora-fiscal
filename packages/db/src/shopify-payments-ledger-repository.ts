import { and, asc, eq, isNull } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import type { ImportIssueCode } from './import-issue-codes.js';
import { payouts, shopifyPaymentsLedgerEntries } from './schema.js';
import * as schema from './schema.js';

export type ShopifyPaymentsLedgerEntry = typeof shopifyPaymentsLedgerEntries.$inferSelect;
export type NewShopifyPaymentsLedgerEntry = typeof shopifyPaymentsLedgerEntries.$inferInsert;
export type Payout = typeof payouts.$inferSelect;

const GROSS_FEE_NET_MISMATCH: ImportIssueCode = 'GROSS_FEE_NET_MISMATCH';
const GROSS_FEE_NET_TOLERANCE = 0.01;
const PAYOUT_CHANNEL = 'SHOPIFY';

export interface LedgerWriteIssue { code: ImportIssueCode; severity: 'HIGH'; message: string; externalEntryKey: string; }

export interface CreateManyLedgerEntriesResult {
  entries: ShopifyPaymentsLedgerEntry[];
  issues: LedgerWriteIssue[];
}

/**
 * SHOPIFY-03: platform settlement-ledger evidence. A real `payouts` row is
 * created (idempotently, per `payouts_external_uq` on tenantId+channel+
 * externalPayoutId) only for rows that carry an `externalPayoutId` --
 * ledger entries without one are evidence-only (pending settlement) and
 * surface through `findPendingSettlement`.
 */
export class DrizzleShopifyPaymentsLedgerRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Idempotent bulk insert keyed on (tenantId, externalEntryKey). For each
   * row that carries an `externalPayoutId`, also finds-or-creates the
   * corresponding `payouts` row (never overwritten on re-import). Rows whose
   * amount/fee/net don't reconcile within tolerance are still written --
   * `GROSS_FEE_NET_MISMATCH` is returned as a soft issue, not a rejection,
   * mirroring the connector's own preview-time validation.
   */
  async createMany(tenantId: string, importFileId: string, rows: Array<Omit<NewShopifyPaymentsLedgerEntry, 'tenantId' | 'importFileId'>>): Promise<CreateManyLedgerEntriesResult> {
    if (rows.length === 0) return { entries: [], issues: [] };

    const issues: LedgerWriteIssue[] = [];
    for (const row of rows) {
      const amount = Number(row.amount);
      const fee = Number(row.feeAmount);
      const net = Number(row.netAmount);
      if (Math.abs(amount - fee - net) > GROSS_FEE_NET_TOLERANCE) {
        issues.push({ code: GROSS_FEE_NET_MISMATCH, severity: 'HIGH', message: 'Bruto − fee no coincide con neto', externalEntryKey: row.externalEntryKey });
      }
    }

    return this.db.transaction(async (transaction) => {
      const entries = await transaction
        .insert(shopifyPaymentsLedgerEntries)
        .values(rows.map((row) => ({ ...row, tenantId, importFileId })))
        .onConflictDoNothing({ target: [shopifyPaymentsLedgerEntries.tenantId, shopifyPaymentsLedgerEntries.externalEntryKey] })
        .returning();

      for (const row of rows) {
        if (!row.externalPayoutId) continue;
        const externalPayoutId = row.externalPayoutId;
        const [existing] = await transaction
          .select()
          .from(payouts)
          .where(and(eq(payouts.tenantId, tenantId), eq(payouts.channel, PAYOUT_CHANNEL), eq(payouts.externalPayoutId, externalPayoutId)))
          .limit(1);
        if (existing) continue;

        const [inserted] = await transaction
          .insert(payouts)
          .values({ tenantId, channel: PAYOUT_CHANNEL, externalPayoutId, currency: row.currency, netAmount: '0' })
          .onConflictDoNothing({ target: [payouts.tenantId, payouts.channel, payouts.externalPayoutId] })
          .returning();
        // No refetch-on-conflict needed here: within a single transaction,
        // a conflicting concurrent insert from another connection would
        // block on the unique index until this transaction commits/aborts,
        // so `inserted` being empty here can only mean this same batch
        // already created the row for an earlier row with the same
        // externalPayoutId -- nothing further to do.
        void inserted;
      }

      return { entries, issues };
    });
  }

  /** Tenant-scoped lookup by the real join key (shopifyOrderName). */
  async findByTenantAndOrder(tenantId: string, shopifyOrderName: string): Promise<ShopifyPaymentsLedgerEntry[]> {
    return this.db
      .select()
      .from(shopifyPaymentsLedgerEntries)
      .where(and(eq(shopifyPaymentsLedgerEntries.tenantId, tenantId), eq(shopifyPaymentsLedgerEntries.shopifyOrderName, shopifyOrderName)))
      .orderBy(asc(shopifyPaymentsLedgerEntries.createdAt));
  }

  async findPaginated(tenantId: string, input: { limit: number; offset: number }): Promise<ShopifyPaymentsLedgerEntry[]> {
    return this.db
      .select()
      .from(shopifyPaymentsLedgerEntries)
      .where(eq(shopifyPaymentsLedgerEntries.tenantId, tenantId))
      .orderBy(asc(shopifyPaymentsLedgerEntries.createdAt))
      .limit(input.limit)
      .offset(input.offset);
  }

  /**
   * Read model for ledger entries with no `externalPayoutId` -- evidence
   * recorded, but no real `payouts` row exists yet (pending settlement).
   */
  async findPendingSettlement(tenantId: string): Promise<ShopifyPaymentsLedgerEntry[]> {
    return this.db
      .select()
      .from(shopifyPaymentsLedgerEntries)
      .where(and(eq(shopifyPaymentsLedgerEntries.tenantId, tenantId), isNull(shopifyPaymentsLedgerEntries.externalPayoutId)))
      .orderBy(asc(shopifyPaymentsLedgerEntries.createdAt));
  }
}
