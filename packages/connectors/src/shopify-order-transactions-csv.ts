import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import type { ImportIssueCode } from '@anclora/db';

const ORDER_EVIDENCE_MISSING: ImportIssueCode = 'ORDER_EVIDENCE_MISSING';
const ORDER_TRANSACTION_STATUS_UNSUPPORTED: ImportIssueCode = 'ORDER_TRANSACTION_STATUS_UNSUPPORTED';

export type ShopifyOrderTransactionKind = 'sale' | 'refund' | 'authorization' | 'capture' | 'void' | 'unknown';

export interface ShopifyOrderTransactionRow {
  order: string;
  name: string;
  kind: ShopifyOrderTransactionKind;
  gateway: string;
  createdAt: string;
  /**
   * Free-text status as observed in the export (e.g. "success"/"failure") —
   * not over-typed into a union since the fixture doesn't show a closed enum.
   */
  status: string;
  amount: number;
  currency: string;
  cardType?: string;
  paymentMethod?: string;
  businessKey: string;
}

export interface ShopifyOrderTransactionsIssue { row: number; code: string; severity: 'INFO' | 'WARNING' | 'HIGH' | 'BLOCKING'; message: string; }
export interface ShopifyOrderTransactionsEvidence { hash: string; rows: ShopifyOrderTransactionRow[]; issues: ShopifyOrderTransactionsIssue[]; }

const requiredHeaders = ['Order', 'Name', 'Kind', 'Gateway', 'Created At', 'Status', 'Amount', 'Currency'];
// Columns unique to Orders/Ledger exports — presence signals the wrong file.
const otherStreamSignatureColumns = ['Financial Status', 'Fulfillment Status', 'Checkout', 'Payout Status'];

const knownKinds: readonly ShopifyOrderTransactionKind[] = ['sale', 'refund', 'authorization', 'capture', 'void'];

function toKind(raw: string): ShopifyOrderTransactionKind {
  const normalized = raw.trim().toLowerCase();
  return (knownKinds as readonly string[]).includes(normalized) ? (normalized as ShopifyOrderTransactionKind) : 'unknown';
}

function parseHeaderLine(bytes: Uint8Array): string[] {
  const firstLine = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '').split('\n')[0]?.replace(/\r$/, '') ?? '';
  return firstLine.split(',');
}

function validateSignature(headers: string[]): { valid: true } | { valid: false; missing: string[]; message?: string } {
  const headerSet = new Set(headers);
  const looksLikeOtherStream = otherStreamSignatureColumns.some((column) => headerSet.has(column));
  if (looksLikeOtherStream) {
    return { valid: false, missing: [], message: 'CSV parece ser de Orders/Ledger, no de Order Transactions' };
  }
  const missing = requiredHeaders.filter((header) => !headerSet.has(header));
  if (missing.length > 0) return { valid: false, missing };
  return { valid: true };
}

export function isShopifyOrderTransactionsCsvFile(bytes: Uint8Array): boolean {
  return validateSignature(parseHeaderLine(bytes)).valid;
}

export function parseShopifyOrderTransactionsCsv(bytes: Uint8Array, knownOrderIds?: Set<string>): ShopifyOrderTransactionsEvidence {
  const source = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '');
  const signatureCheck = validateSignature(source.slice(0, source.indexOf('\n')).replace(/\r$/, '').split(','));
  if (!signatureCheck.valid) {
    if (signatureCheck.message) throw new Error(signatureCheck.message);
    throw new Error(`Faltan columnas obligatorias: ${signatureCheck.missing.join(', ')}`);
  }
  const records = parse(source, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];

  const issues: ShopifyOrderTransactionsIssue[] = [];
  const rows = records.map((record, index): ShopifyOrderTransactionRow => {
    const rowNumber = index + 2;
    // Required columns are already guaranteed present by validateSignature()
    // above; `?? ''` here only satisfies noUncheckedIndexedAccess typing.
    const order = record.Order ?? '';
    const name = record.Name ?? '';
    const gateway = record.Gateway ?? '';
    const createdAt = record['Created At'] ?? '';
    const status = record.Status ?? '';
    const currency = record.Currency ?? '';
    const kind = toKind(record.Kind ?? '');
    if (kind === 'unknown') {
      issues.push({ row: rowNumber, code: ORDER_TRANSACTION_STATUS_UNSUPPORTED, severity: 'WARNING', message: `Kind no reconocido: "${record.Kind}"` });
    }
    if (knownOrderIds && !knownOrderIds.has(name)) {
      issues.push({ row: rowNumber, code: ORDER_EVIDENCE_MISSING, severity: 'HIGH', message: `Pedido ${name} no encontrado en la evidencia de Orders importada` });
    }
    // Amount sign preserved as-is (no Math.abs) — refunds carry their real sign from the export.
    const amount = Number(record.Amount);
    // Business key spec order: order + name + kind + gateway + createdAt + amount + currency + status.
    const businessKey = createHash('sha256')
      .update([order, name, kind, gateway, createdAt, amount, currency, status].join('|'))
      .digest('hex');
    return {
      order,
      name,
      kind,
      gateway,
      createdAt,
      status,
      amount,
      currency,
      ...(record['Card Type'] ? { cardType: record['Card Type'] } : {}),
      ...(record['Payment Method'] ? { paymentMethod: record['Payment Method'] } : {}),
      businessKey,
    };
  });

  return { hash: createHash('sha256').update(bytes).digest('hex'), rows, issues };
}
