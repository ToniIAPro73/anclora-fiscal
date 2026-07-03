import { randomUUID } from 'node:crypto';
import { extractShopifyOrdersPdf, isKdpXlsxFile, previewKdpXlsx, previewShopifyCsv } from '@anclora/connectors';
import type { StoragePort } from '@anclora/core/server';

export interface ImportPreviewResponse {
  jobId: string;
  status: 'PREVIEW_READY';
  connector: 'shopify-csv' | 'shopify-pdf' | 'kdp-xlsx';
  evidence: { key: string; sha256: string; size: number; mimeType: string };
  summary: { records: number; issues: number; orderIds: string[] };
  issues: Array<{ code: string; severity: string; message: string; row?: number }>;
}

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function previewImport(input: { tenantId: string; filename: string; mimeType: string; bytes: Uint8Array; storage: StoragePort }): Promise<ImportPreviewResponse> {
  const jobId = randomUUID();
  if (input.filename.toLowerCase().endsWith('.csv') || input.mimeType === 'text/csv') {
    const preview = previewShopifyCsv(input.bytes);
    const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
    return { jobId, status: 'PREVIEW_READY', connector: 'shopify-csv', evidence, summary: { records: preview.rows.length, issues: preview.issues.length, orderIds: [...new Set(preview.rows.map((row) => row.Order))] }, issues: preview.issues };
  }
  if (input.filename.toLowerCase().endsWith('.pdf') || input.mimeType === 'application/pdf') {
    const preview = await extractShopifyOrdersPdf(input.bytes);
    const evidence = await input.storage.put({ tenantId: input.tenantId, bytes: input.bytes, mimeType: input.mimeType });
    const issues = preview.orders.flatMap((order) => order.issues.map((issue) => ({ ...issue, message: `${order.orderId}: ${issue.message}` })));
    return { jobId, status: 'PREVIEW_READY', connector: 'shopify-pdf', evidence, summary: { records: preview.orders.length, issues: issues.length, orderIds: preview.orders.map((order) => order.orderId) }, issues };
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
        summary: { records: preview.rows.length, issues: preview.issues.length, orderIds: [...new Set(preview.rows.map((row) => row.isbnOrAsin))] },
        issues: preview.issues,
      };
    }
  }
  throw new Error('Formato no soportado');
}
