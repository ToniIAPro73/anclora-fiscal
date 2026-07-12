import { randomUUID } from 'node:crypto';
import { extractShopifyOrdersCsv, isExpensesCsvFile, isKdpXlsxFile, isShopifyOrdersCsvFile, isShopifyOrderTransactionsCsvFile, isShopifyPaymentsLedgerCsvFile, parseShopifyOrderTransactionsCsv, previewExpensesCsv, previewKdpXlsx, previewShopifyCsv } from '@anclora/connectors';
import { summarizeRoyaltyLinesByFormat, type RoyaltyFormatSummary, type RoyaltyLine, type RoyaltyStatement, type StoragePort } from '@anclora/core/server';
import {
  normalizeShopifyOrdersCsv,
  normalizeShopifyOrderTransactions,
  normalizeShopifyPaymentsLedger,
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

export interface BuyerPreview {
  customerName?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  customerCountry?: string | null;
  customerType?: string | null;
}

export type PreviewOrderTransaction = NewShopifyOrderPaymentEventWithoutTenant & BuyerPreview;
export type PreviewPaymentsLedgerEntry = NewShopifyPaymentsLedgerEntryWithoutTenant & BuyerPreview;

export interface ImportPreviewResponse {
  jobId: string;
  status: 'PREVIEW_READY';
  connector: 'shopify-csv' | 'shopify-orders-csv' | 'shopify-order-transactions-csv' | 'kdp-xlsx' | 'expenses-csv';
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
  /** SHOPIFY-04: safe, source-specific preview contract exposed to clients. */
  shopifyOrders?: { orders: Array<{ orderName: string; commercialDate?: string; totalAmount?: string; taxAmount?: string; financialStatus?: string; fulfillmentStatus?: string; productNature?: string; customerName?: string; customerEmail?: string; customerAddress?: string; customerCountry?: string; customerType?: string; discountCode?: string; discountAmount?: string; lines: Array<{ title: string; quantity: string; unitPrice: string; discountAmount: string; subtotalAmount: string }> }> };
  shopifyOrderTransactions?: { events: PreviewOrderTransaction[] };
  shopifyPaymentsLedger?: { entries: PreviewPaymentsLedgerEntry[] };
  expenses?: ReturnType<typeof previewExpensesCsv>;
}

export function toSafeImportPreview(preview: ImportPreviewResponse, status: string, issueIds: string[] = []) {
  const safePreview = { ...preview };
  delete safePreview.commercialOrders;
  delete safePreview.commercialOrderGroups;
  delete safePreview.financialEvents;
  delete safePreview.orderTransactions;
  delete safePreview.paymentsLedger;
  const issues = preview.issues.map((issue, index) => ({
    ...issue,
    position: issue.row ?? 0,
    suggestedAction: 'Revisa la evidencia indicada antes de confirmar.',
    blocking: issue.severity === 'BLOCKING',
    ...(issueIds[index] ? { id: issueIds[index] } : {}),
  }));
  return { ...safePreview, issues, status };
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
  findPreviewByExternalOrderIds?(tenantId: string, sourceChannel: string, externalOrderIds: string[]): Promise<Array<{ externalOrderId: string } & BuyerPreview>>;
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

async function findBuyerPreviews(
  tenantId: string,
  orderIds: string[],
  repository?: CommercialOrdersDedupPort,
): Promise<Map<string, BuyerPreview>> {
  if (!repository?.findPreviewByExternalOrderIds || orderIds.length === 0) return new Map();
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
  const rows = await repository.findPreviewByExternalOrderIds(tenantId, 'SHOPIFY', uniqueOrderIds);
  return new Map(rows.map((row) => [row.externalOrderId, {
    customerName: row.customerName ?? null,
    customerEmail: row.customerEmail ?? null,
    customerAddress: row.customerAddress ?? null,
    customerCountry: row.customerCountry ?? null,
    customerType: row.customerType ?? null,
  }]));
}

function withBuyerPreview<T extends { shopifyOrderName: string }>(row: T, buyers: Map<string, BuyerPreview>): T & BuyerPreview {
  return { ...row, ...(buyers.get(row.shopifyOrderName) ?? {}) };
}

export async function previewImport(
  input: { tenantId: string; filename: string; mimeType: string; bytes: Uint8Array; storage: StoragePort },
  dependencies?: ImportPreviewDedupDependencies,
): Promise<ImportPreviewResponse> {
  const jobId = randomUUID();
  if (input.filename.toLowerCase().endsWith('.csv') || input.mimeType === 'text/csv') {
    if (isExpensesCsvFile(input.bytes)) { const expenses=previewExpensesCsv(input.bytes); const evidence=await input.storage.put({tenantId:input.tenantId,bytes:input.bytes,mimeType:input.mimeType}); return {jobId,status:'PREVIEW_READY',connector:'expenses-csv',evidence,summary:{records:expenses.documents.length,issues:expenses.issues.length,orderIds:[]},issues:expenses.issues.map(issue=>({code:issue.code,severity:issue.blocking?'BLOCKING':'WARNING',message:issue.message,row:issue.row})),expenses}; }
    if (isShopifyOrdersCsvFile(input.bytes)) {
      const preview = extractShopifyOrdersCsv(input.bytes);
      const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
      // SHOPIFY-02: grouped by `Name` (1 order + N lines), not 1-row-per-order.
      const allOrderIds = preview.groupedOrders.map((order) => order.orderId);
      const allGroups = normalizeShopifyOrdersCsv(preview.groupedOrders);
      const allCommercialOrders = allGroups.map((group) => group.order);
      const allIssues = preview.groupedOrders.flatMap((order) => order.issues.map((issue) => ({ ...issue, message: `${order.orderId}: ${issue.message}` })));
      const rowsAnalyzed = preview.orders.length;
      const shopifyOrders = { orders: allGroups.map((group) => ({
        orderName: group.order.externalOrderId,
        ...(group.order.commercialDate ? { commercialDate: group.order.commercialDate.toISOString() } : {}),
        ...(group.order.totalAmount ? { totalAmount: group.order.totalAmount } : {}),
        ...(group.order.taxAmount ? { taxAmount: group.order.taxAmount } : {}),
        ...(group.order.financialStatus ? { financialStatus: group.order.financialStatus } : {}),
        ...(group.order.fulfillmentStatus ? { fulfillmentStatus: group.order.fulfillmentStatus } : {}),
        ...(group.order.productNature ? { productNature: group.order.productNature } : {}),
        ...(group.order.customerName ? { customerName: group.order.customerName } : {}),
        ...(group.order.customerEmail ? { customerEmail: group.order.customerEmail } : {}),
        ...(group.order.customerAddress ? { customerAddress: group.order.customerAddress } : {}),
        ...(group.order.customerCountry ? { customerCountry: group.order.customerCountry } : {}),
        ...(group.order.customerType ? { customerType: group.order.customerType } : {}),
        ...(group.order.discountCode ? { discountCode: group.order.discountCode } : {}),
        ...(group.order.discountAmount ? { discountAmount: group.order.discountAmount } : {}),
        lines: group.lines.map((line) => ({ title: line.title, quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: line.discountAmount ?? '0', subtotalAmount: line.subtotalAmount })),
      })) };

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
          shopifyOrders,
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
        shopifyOrders: { orders: shopifyOrders.orders.filter((order) => !existingOrderIds.has(order.orderName)) },
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
      const buyers = await findBuyerPreviews(
        input.tenantId,
        orderTransactions.map((row) => row.shopifyOrderName),
        dependencies?.commercialOrdersRepository,
      );
      return {
        jobId,
        status: 'PREVIEW_READY',
        connector: 'shopify-order-transactions-csv',
        evidence,
        summary: { records: parsed.rows.length, issues: parsed.issues.length, orderIds: [...new Set(parsed.rows.map((row) => row.name))] },
        issues: parsed.issues,
        orderTransactions,
        shopifyOrderTransactions: { events: orderTransactions.map((row) => withBuyerPreview(row, buyers)) },
      };
    }
    if (isShopifyPaymentsLedgerCsvFile(input.bytes)) {
      const preview = previewShopifyCsv(input.bytes);
      const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
      // SHOPIFY-03: platform settlement-ledger evidence, computed from the
      // same rows as allFinancialEvents (distinct persistence target --
      // shopify_payments_ledger_entries, not financial_events).
      const allPaymentsLedger = normalizeShopifyPaymentsLedger(preview);
      const buyers = await findBuyerPreviews(
        input.tenantId,
        allPaymentsLedger.map((row) => row.shopifyOrderName),
        dependencies?.commercialOrdersRepository,
      );

      return {
        jobId,
        status: 'PREVIEW_READY',
        connector: 'shopify-csv',
        evidence,
        summary: { records: preview.rows.length, issues: preview.issues.length, orderIds: [...new Set(preview.rows.map((row) => row.Order))] },
        issues: preview.issues,
        paymentsLedger: allPaymentsLedger,
        shopifyPaymentsLedger: { entries: allPaymentsLedger.map((row) => withBuyerPreview(row, buyers)) },
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
