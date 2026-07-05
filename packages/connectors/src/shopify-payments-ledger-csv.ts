import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { ImportIssueCode } from '@anclora/db';

const GROSS_FEE_NET_MISMATCH: ImportIssueCode = 'GROSS_FEE_NET_MISMATCH';
const PLATFORM_VAT_ZERO_UNVALIDATED: ImportIssueCode = 'PLATFORM_VAT_ZERO_UNVALIDATED';

export const shopifyPaymentsLedgerHeaders = [
  'Transaction Date', 'Type', 'Order', 'Card Brand', 'Card Source', 'Payout Status',
  'Payout Date', 'Payout ID', 'Available On', 'Amount', 'Fee', 'Net', 'Checkout',
  'Payment Method Name', 'Presentment Amount', 'Presentment Currency', 'Currency', 'VAT',
] as const;

/** @deprecated Use {@link shopifyPaymentsLedgerHeaders} — kept for backward compatibility. */
export const shopifyHeaders = shopifyPaymentsLedgerHeaders;

const money = z.string().regex(/^-?\d+\.\d{2}$/);
const zonedDate = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/);

export const shopifyTransactionSchema = z.object({
  'Transaction Date': zonedDate,
  Type: z.string().min(1),
  // SHOPIFY-01: no longer assumes an "AI-" prefix — matches the Orders
  // connector's relaxed orderId validation (non-empty string only), since
  // this field must accept the same order name/number Orders emits.
  Order: z.string().min(1),
  'Card Brand': z.string(),
  'Card Source': z.string(),
  'Payout Status': z.string(),
  'Payout Date': z.string(),
  'Payout ID': z.string(),
  'Available On': z.string(),
  Amount: money,
  Fee: money,
  Net: money,
  Checkout: z.string().regex(/^#\d+$/),
  'Payment Method Name': z.string(),
  'Presentment Amount': money,
  'Presentment Currency': z.string().length(3),
  Currency: z.string().length(3),
  VAT: money,
}).strict();

export type ShopifyTransaction = z.infer<typeof shopifyTransactionSchema>;
export type ShopifyTransactionKind = 'charge' | 'refund' | 'partial_refund' | 'fee' | 'payout' | 'adjustment' | 'chargeback' | 'unknown';

export interface ShopifyCsvIssue { row: number; code: string; severity: 'INFO' | 'WARNING' | 'HIGH' | 'BLOCKING'; message: string; }
export interface ShopifyCsvPreview { hash: string; headers: string[]; rows: Array<ShopifyTransaction & { kind: ShopifyTransactionKind; businessKey: string }>; issues: ShopifyCsvIssue[]; }

export function classifyTransaction(row: ShopifyTransaction): ShopifyTransactionKind {
  const type = row.Type.toLowerCase();
  if (['charge', 'refund', 'fee', 'payout', 'adjustment', 'chargeback'].includes(type)) return type as ShopifyTransactionKind;
  return 'unknown';
}

/**
 * Signature-based detector for the Shopify Payments Ledger export — checks
 * that the required column set is present regardless of column order or
 * extra/optional columns, mirroring the Orders and Order-Transactions
 * detectors (SHOPIFY-01). Distinct from the strict ordered-array check still
 * used internally by `previewShopifyPaymentsLedgerCsv` for full-schema
 * validation.
 */
export function isShopifyPaymentsLedgerCsvFile(bytes: Uint8Array): boolean {
  const firstLine = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '').split('\n')[0]?.replace(/\r$/, '') ?? '';
  const headers = new Set(firstLine.split(','));
  return (shopifyPaymentsLedgerHeaders as readonly string[]).every((header) => headers.has(header));
}

export function previewShopifyPaymentsLedgerCsv(bytes: Uint8Array): ShopifyCsvPreview {
  const source = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '');
  const records = parse(source, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: false }) as Record<string, string>[];
  const parsedHeader = source.slice(0, source.indexOf('\n')).replace(/\r$/, '').split(',');
  if (JSON.stringify(parsedHeader) !== JSON.stringify(shopifyPaymentsLedgerHeaders)) throw new Error('Cabeceras Shopify no reconocidas o desordenadas');

  const issues: ShopifyCsvIssue[] = [];
  const rows = records.map((record, index) => {
    const result = shopifyTransactionSchema.safeParse(record);
    if (!result.success) throw new Error(`Fila ${index + 2} inválida: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
    const row = result.data;
    const kind = classifyTransaction(row);
    const amount = Number(row.Amount);
    const fee = Number(row.Fee);
    const net = Number(row.Net);
    if (Math.abs(amount - fee - net) > 0.005) issues.push({ row: index + 2, code: GROSS_FEE_NET_MISMATCH, severity: 'HIGH', message: 'Bruto − fee no coincide con neto' });
    if (row.VAT === '0.00') issues.push({ row: index + 2, code: PLATFORM_VAT_ZERO_UNVALIDATED, severity: 'WARNING', message: 'VAT del canal a cero; no equivale a IVA fiscal validado' });
    // Business key spec order: Order + Checkout + Type + Transaction Date + Amount + Fee + Net + Currency.
    const businessKey = createHash('sha256').update([row.Order, row.Checkout, row.Type, row['Transaction Date'], row.Amount, row.Fee, row.Net, row.Currency].join('|')).digest('hex');
    return { ...row, kind, businessKey };
  });
  const rowsByOrder = new Map<string, typeof rows>();
  for (const row of rows) rowsByOrder.set(row.Order, [...(rowsByOrder.get(row.Order) ?? []), row]);
  for (const [order, orderRows] of rowsByOrder) {
    const hasCharge = orderRows.some((row) => row.kind === 'charge');
    const hasRefund = orderRows.some((row) => row.kind === 'refund');
    const commercialNet = orderRows.reduce((sum, row) => sum + Number(row.Amount), 0);
    if (hasCharge && hasRefund && Math.abs(commercialNet) < 0.005) {
      issues.push({ row: 0, code: 'FULL_REFUND_NET_ZERO', severity: 'HIGH', message: `${order}: charge y refund producen neto comercial cero; revisar rectificativa` });
    }
  }
  return { hash: createHash('sha256').update(bytes).digest('hex'), headers: parsedHeader, rows, issues };
}

/** @deprecated Use {@link previewShopifyPaymentsLedgerCsv} — kept for backward compatibility. */
export const previewShopifyCsv = previewShopifyPaymentsLedgerCsv;
