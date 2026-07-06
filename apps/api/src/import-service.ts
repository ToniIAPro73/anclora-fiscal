import { randomUUID } from 'node:crypto';
import { extractShopifyOrdersCsv, isKdpXlsxFile, isShopifyOrdersCsvFile, isShopifyOrderTransactionsCsvFile, isShopifyPaymentsLedgerCsvFile, parseShopifyOrderTransactionsCsv, previewKdpXlsx, previewShopifyCsv } from '@anclora/connectors';
import { summarizeRoyaltyLinesByFormat, type RoyaltyFormatSummary, type RoyaltyLine, type RoyaltyStatement, type StoragePort } from '@anclora/core/server';
import {
  normalizeShopifyOrdersCsv,
  normalizeShopifyOrderTransactions,
  normalizeShopifyPaymentsLedger,
  normalizeShopifyPaymentTransactions,
  type NewCommercialOrderWithoutTenant,
  type NewFinancialEventWithoutTenant,
  type NewShopifyOrderPaymentEventWithoutTenant,
  type NewShopifyPaymentsLedgerEntryWithoutTenant,
  type NormalizedShopifyOrderGroup,
} from './ingestion-normalization-service.js';

/**
 * SHOPIFY-02 requirement 12: lets a caller distinguish rows analyzed (raw
 * CSV row count) from orders grouped (unique `Name` groups) from lines
 * (total order_lines across all groups) from duplicates skipped
 * (already-imported orders filtered out by the preview-time dedup lookup).
 */
export interface ImportGroupingSummary {
  rowsAnalyzed: number;
  ordersGrouped: number;
  lines: number;
  duplicatesSkipped: number;
}

export interface ImportPreviewResponse {
  jobId: string;
  status: 'PREVIEW_READY';
  connector: 'shopify-csv' | 'shopify-orders-csv' | 'shopify-order-transactions-csv' | 'kdp-xlsx';
  evidence: { key: string; sha256: string; size: number; mimeType: string };
  summary: { records: number; issues: number; orderIds: string[]; royaltyByFormat?: RoyaltyFormatSummary[]; alreadyImportedCount?: number; allAlreadyImported?: boolean; grouping?: ImportGroupingSummary };
  issues: Array<{ code: string; severity: string; message: string; row?: number; sheet?: string }>;
  royalty?: { statement: RoyaltyStatement; lines: RoyaltyLine[] };
  commercialOrders?: NewCommercialOrderWithoutTenant[];
  /** SHOPIFY-02: order + lines, paired — the shape persistFiscalRecords() actually writes. */
  commercialOrderGroups?: NormalizedShopifyOrderGroup[];
  financialEvents?: NewFinancialEventWithoutTenant[];
  /** SHOPIFY-03: order-level payment-transaction evidence (shopify-order-transactions-csv connector). */
  orderTransactions?: NewShopifyOrderPaymentEventWithoutTenant[];
  /** SHOPIFY-03: platform settlement-ledger evidence, computed alongside financialEvents from the same shopify-csv (Payments Ledger) rows. */
  paymentsLedger?: NewShopifyPaymentsLedgerEntryWithoutTenant[];
}

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Read-only dedup-lookup ports for the preview-time filter (Task 4.5). These
 * are deliberately narrow (single method each) rather than the full
 * repository interfaces from import-preview-persistence.ts — this is an
 * earlier, optional, preview-time filter layered on top of persist-time
 * idempotency (onConflictDoNothing etc.), which remains the source of truth.
 * When a given dependency is omitted, its corresponding preview branch is
 * returned unfiltered — byte-identical to previewImport's pre-existing
 * behavior — so existing callers (and their tests) are unaffected.
 */
export interface CommercialOrdersDedupPort {
  findExistingExternalOrderIds(tenantId: string, sourceChannel: string, externalOrderIds: string[]): Promise<Set<string>>;
}
export interface FinancialEventsDedupPort {
  findExistingExternalEventIds(tenantId: string, sourceChannel: string, externalEventIds: string[]): Promise<Set<string>>;
}
export interface RoyaltyDedupPort {
  findExistingBusinessKeys(tenantId: string, businessKeys: string[]): Promise<Set<string>>;
}

export interface ImportPreviewDedupDependencies {
  commercialOrdersRepository?: CommercialOrdersDedupPort | undefined;
  financialEventsRepository?: FinancialEventsDedupPort | undefined;
  royaltyRepository?: RoyaltyDedupPort | undefined;
}

export async function previewImport(
  input: { tenantId: string; filename: string; mimeType: string; bytes: Uint8Array; storage: StoragePort },
  dependencies?: ImportPreviewDedupDependencies,
): Promise<ImportPreviewResponse> {
  const jobId = randomUUID();
  if (input.filename.toLowerCase().endsWith('.csv') || input.mimeType === 'text/csv') {
    if (isShopifyOrdersCsvFile(input.bytes)) {
      const preview = extractShopifyOrdersCsv(input.bytes);
      const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
      // SHOPIFY-02: grouped by `Name` (1 order + N lines), not 1-row-per-order.
      const allOrderIds = preview.groupedOrders.map((order) => order.orderId);
      const allGroups = normalizeShopifyOrdersCsv(preview.groupedOrders);
      const allCommercialOrders = allGroups.map((group) => group.order);
      const allIssues = preview.groupedOrders.flatMap((order) => order.issues.map((issue) => ({ ...issue, message: `${order.orderId}: ${issue.message}` })));
      const rowsAnalyzed = preview.orders.length;

      const sourceChannel = allCommercialOrders[0]?.sourceChannel;
      const existingOrderIds = dependencies?.commercialOrdersRepository && sourceChannel
        ? await dependencies.commercialOrdersRepository.findExistingExternalOrderIds(input.tenantId, sourceChannel, allOrderIds)
        : undefined;

      if (!existingOrderIds) {
        const lines = allGroups.reduce((sum, group) => sum + group.lines.length, 0);
        return {
          jobId,
          status: 'PREVIEW_READY',
          connector: 'shopify-orders-csv',
          evidence,
          summary: { records: rowsAnalyzed, issues: allIssues.length, orderIds: allOrderIds, grouping: { rowsAnalyzed, ordersGrouped: allGroups.length, lines, duplicatesSkipped: 0 } },
          issues: allIssues,
          commercialOrders: allCommercialOrders,
          commercialOrderGroups: allGroups,
        };
      }

      const orderIds = allOrderIds.filter((id) => !existingOrderIds.has(id));
      const groups = allGroups.filter((group) => !existingOrderIds.has(group.order.externalOrderId));
      const commercialOrders = groups.map((group) => group.order);
      const issues = preview.groupedOrders
        .filter((order) => !existingOrderIds.has(order.orderId))
        .flatMap((order) => order.issues.map((issue) => ({ ...issue, message: `${order.orderId}: ${issue.message}` })));
      const alreadyImportedCount = allOrderIds.length - orderIds.length;
      const lines = groups.reduce((sum, group) => sum + group.lines.length, 0);
      return {
        jobId,
        status: 'PREVIEW_READY',
        connector: 'shopify-orders-csv',
        evidence,
        summary: {
          records: rowsAnalyzed,
          issues: issues.length,
          orderIds,
          alreadyImportedCount,
          allAlreadyImported: allOrderIds.length > 0 && orderIds.length === 0,
          grouping: { rowsAnalyzed, ordersGrouped: groups.length, lines, duplicatesSkipped: alreadyImportedCount },
        },
        issues,
        commercialOrders,
        commercialOrderGroups: groups,
      };
    }
    if (isShopifyOrderTransactionsCsvFile(input.bytes)) {
      // SHOPIFY-03: order-level payment-transaction evidence (sale/refund/
      // authorization/capture/void). Persisted confirm-time-only via
      // persistFiscalRecords() -- see import-preview-persistence.ts, which
      // resolves commercialOrderId per row against the real commercial_orders
      // table (shopifyOrderName is the join key, never shopifyOrderId).
      const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
      const parsed = parseShopifyOrderTransactionsCsv(input.bytes);
      const orderTransactions = normalizeShopifyOrderTransactions(parsed);
      return {
        jobId,
        status: 'PREVIEW_READY',
        connector: 'shopify-order-transactions-csv',
        evidence,
        summary: { records: parsed.rows.length, issues: parsed.issues.length, orderIds: [...new Set(parsed.rows.map((row) => row.name))] },
        issues: parsed.issues,
        orderTransactions,
      };
    }
    if (isShopifyPaymentsLedgerCsvFile(input.bytes)) {
      const preview = previewShopifyCsv(input.bytes);
      const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
      const allFinancialEvents = normalizeShopifyPaymentTransactions(preview);
      // SHOPIFY-03: platform settlement-ledger evidence, computed from the
      // same rows as allFinancialEvents (distinct persistence target --
      // shopify_payments_ledger_entries, not financial_events).
      const allPaymentsLedger = normalizeShopifyPaymentsLedger(preview);

      const sourceChannel = allFinancialEvents[0]?.sourceChannel;
      const existingEventIds = dependencies?.financialEventsRepository && sourceChannel
        ? await dependencies.financialEventsRepository.findExistingExternalEventIds(input.tenantId, sourceChannel, preview.rows.map((row) => row.businessKey))
        : undefined;

      if (!existingEventIds) {
        return { jobId, status: 'PREVIEW_READY', connector: 'shopify-csv', evidence, summary: { records: preview.rows.length, issues: preview.issues.length, orderIds: [...new Set(preview.rows.map((row) => row.Order))] }, issues: preview.issues, financialEvents: allFinancialEvents, paymentsLedger: allPaymentsLedger };
      }

      const keep = preview.rows.map((row) => !existingEventIds.has(row.businessKey));
      const rows = preview.rows.filter((_, index) => keep[index]);
      const financialEvents = allFinancialEvents.filter((_, index) => keep[index]);
      const paymentsLedger = allPaymentsLedger.filter((_, index) => keep[index]);
      // Row-level issues carry a 1-based CSV row (index + 2); the one
      // synthetic order-level issue (FULL_REFUND_NET_ZERO) uses row: 0 and
      // isn't tied to a single businessKey, so it's kept as-is.
      const issues = preview.issues.filter((issue) => issue.row === 0 || keep[issue.row - 2]);
      const alreadyImportedCount = preview.rows.length - rows.length;
      return {
        jobId,
        status: 'PREVIEW_READY',
        connector: 'shopify-csv',
        evidence,
        summary: {
          records: preview.rows.length,
          issues: issues.length,
          orderIds: [...new Set(rows.map((row) => row.Order))],
          alreadyImportedCount,
          allAlreadyImported: preview.rows.length > 0 && rows.length === 0,
        },
        issues,
        financialEvents,
        paymentsLedger,
      };
    }
  }
  if (input.filename.toLowerCase().endsWith('.xlsx') || input.mimeType === XLSX_MIME_TYPE) {
    if (isKdpXlsxFile(input.bytes)) {
      const preview = previewKdpXlsx(input.bytes);
      const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });

      const existingBusinessKeys = dependencies?.royaltyRepository
        ? await dependencies.royaltyRepository.findExistingBusinessKeys(input.tenantId, preview.rows.map((line) => line.businessKey))
        : undefined;

      if (!existingBusinessKeys) {
        return {
          jobId,
          status: 'PREVIEW_READY',
          connector: 'kdp-xlsx',
          evidence,
          summary: {
            records: preview.rows.length,
            issues: preview.issues.length,
            orderIds: [...new Set(preview.rows.map((row) => row.isbnOrAsin))],
            royaltyByFormat: summarizeRoyaltyLinesByFormat(preview.rows),
          },
          issues: preview.issues,
          royalty: { statement: preview.statement, lines: preview.rows },
        };
      }

      const lines = preview.rows.filter((line) => !existingBusinessKeys.has(line.businessKey));
      const alreadyImportedCount = preview.rows.length - lines.length;
      return {
        jobId,
        status: 'PREVIEW_READY',
        connector: 'kdp-xlsx',
        evidence,
        summary: {
          records: preview.rows.length,
          issues: preview.issues.length,
          orderIds: [...new Set(lines.map((row) => row.isbnOrAsin))],
          royaltyByFormat: summarizeRoyaltyLinesByFormat(lines),
          alreadyImportedCount,
          allAlreadyImported: preview.rows.length > 0 && lines.length === 0,
        },
        issues: preview.issues,
        royalty: { statement: preview.statement, lines },
      };
    }
  }
  throw new Error('Formato no soportado');
}
