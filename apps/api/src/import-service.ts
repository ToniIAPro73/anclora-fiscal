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
  summary: { records: number; issues: number; orderIds: string[]; royaltyByFormat?: RoyaltyFormatSummary[] };
  issues: Array<{ code: string; severity: string; message: string; row?: number; sheet?: string }>;
  royalty?: { statement: RoyaltyStatement; lines: RoyaltyLine[] };
  commercialOrders?: NewCommercialOrderWithoutTenant[];
  financialEvents?: NewFinancialEventWithoutTenant[];
}

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function previewImport(input: { tenantId: string; filename: string; mimeType: string; bytes: Uint8Array; storage: StoragePort }): Promise<ImportPreviewResponse> {
  const jobId = randomUUID();
  if (input.filename.toLowerCase().endsWith('.csv') || input.mimeType === 'text/csv') {
    if (isShopifyOrdersCsvFile(input.bytes)) {
      const preview = extractShopifyOrdersCsv(input.bytes);
      const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
      const issues = preview.orders.flatMap((order) => order.issues.map((issue) => ({ ...issue, message: `${order.orderId}: ${issue.message}` })));
      const commercialOrders = normalizeShopifyOrdersCsv(preview);
      return { jobId, status: 'PREVIEW_READY', connector: 'shopify-orders-csv', evidence, summary: { records: preview.orders.length, issues: issues.length, orderIds: preview.orders.map((order) => order.orderId) }, issues, commercialOrders };
    }
    const preview = previewShopifyCsv(input.bytes);
    const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
    const financialEvents = normalizeShopifyPaymentTransactions(preview);
    return { jobId, status: 'PREVIEW_READY', connector: 'shopify-csv', evidence, summary: { records: preview.rows.length, issues: preview.issues.length, orderIds: [...new Set(preview.rows.map((row) => row.Order))] }, issues: preview.issues, financialEvents };
  }
  if (input.filename.toLowerCase().endsWith('.xlsx') || input.mimeType === XLSX_MIME_TYPE) {
    if (isKdpXlsxFile(input.bytes)) {
      const preview = previewKdpXlsx(input.bytes);
      const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
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
  }
  throw new Error('Formato no soportado');
}
