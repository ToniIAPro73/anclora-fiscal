import { randomUUID } from 'node:crypto';
import { extractShopifyOrdersCsv, isKdpXlsxFile, isShopifyOrdersCsvFile, previewKdpXlsx, previewShopifyCsv } from '@anclora/connectors';
import { summarizeRoyaltyLinesByFormat, type RoyaltyFormatSummary, type RoyaltyLine, type RoyaltyStatement, type StoragePort } from '@anclora/core/server';
import {
  normalizeShopifyOrdersCsv,
  normalizeShopifyPaymentTransactions,
  type NewCommercialOrderWithoutTenant,
  type NewFinancialEventWithoutTenant,
} from './ingestion-normalization-service.js';

export interface ImportPreviewResponse {
  jobId: string;
  status: 'PREVIEW_READY';
  connector: 'shopify-csv' | 'shopify-orders-csv' | 'kdp-xlsx';
  evidence: { key: string; sha256: string; size: number; mimeType: string };
  summary: { records: number; issues: number; orderIds: string[]; royaltyByFormat?: RoyaltyFormatSummary[]; alreadyImportedCount?: number; allAlreadyImported?: boolean };
  issues: Array<{ code: string; severity: string; message: string; row?: number; sheet?: string }>;
  royalty?: { statement: RoyaltyStatement; lines: RoyaltyLine[] };
  commercialOrders?: NewCommercialOrderWithoutTenant[];
  financialEvents?: NewFinancialEventWithoutTenant[];
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
      const allOrderIds = preview.orders.map((order) => order.orderId);
      const allCommercialOrders = normalizeShopifyOrdersCsv(preview);
      const allIssues = preview.orders.flatMap((order) => order.issues.map((issue) => ({ ...issue, message: `${order.orderId}: ${issue.message}` })));

      const sourceChannel = allCommercialOrders[0]?.sourceChannel;
      const existingOrderIds = dependencies?.commercialOrdersRepository && sourceChannel
        ? await dependencies.commercialOrdersRepository.findExistingExternalOrderIds(input.tenantId, sourceChannel, allOrderIds)
        : undefined;

      if (!existingOrderIds) {
        return { jobId, status: 'PREVIEW_READY', connector: 'shopify-orders-csv', evidence, summary: { records: preview.orders.length, issues: allIssues.length, orderIds: allOrderIds }, issues: allIssues, commercialOrders: allCommercialOrders };
      }

      const orderIds = allOrderIds.filter((id) => !existingOrderIds.has(id));
      const commercialOrders = allCommercialOrders.filter((order) => !existingOrderIds.has(order.externalOrderId));
      const issues = preview.orders
        .filter((order) => !existingOrderIds.has(order.orderId))
        .flatMap((order) => order.issues.map((issue) => ({ ...issue, message: `${order.orderId}: ${issue.message}` })));
      const alreadyImportedCount = allOrderIds.length - orderIds.length;
      return {
        jobId,
        status: 'PREVIEW_READY',
        connector: 'shopify-orders-csv',
        evidence,
        summary: { records: preview.orders.length, issues: issues.length, orderIds, alreadyImportedCount, allAlreadyImported: allOrderIds.length > 0 && orderIds.length === 0 },
        issues,
        commercialOrders,
      };
    }
    const preview = previewShopifyCsv(input.bytes);
    const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
    const allFinancialEvents = normalizeShopifyPaymentTransactions(preview);

    const sourceChannel = allFinancialEvents[0]?.sourceChannel;
    const existingEventIds = dependencies?.financialEventsRepository && sourceChannel
      ? await dependencies.financialEventsRepository.findExistingExternalEventIds(input.tenantId, sourceChannel, preview.rows.map((row) => row.businessKey))
      : undefined;

    if (!existingEventIds) {
      return { jobId, status: 'PREVIEW_READY', connector: 'shopify-csv', evidence, summary: { records: preview.rows.length, issues: preview.issues.length, orderIds: [...new Set(preview.rows.map((row) => row.Order))] }, issues: preview.issues, financialEvents: allFinancialEvents };
    }

    const keep = preview.rows.map((row) => !existingEventIds.has(row.businessKey));
    const rows = preview.rows.filter((_, index) => keep[index]);
    const financialEvents = allFinancialEvents.filter((_, index) => keep[index]);
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
    };
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
