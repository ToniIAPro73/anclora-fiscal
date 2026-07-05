import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';

export interface ShopifyOrderEvidence {
  orderId: string;
  commercialDate?: string;
  quantity: number;
  hasBillingBlock: boolean;
  hasShippingBlock: boolean;
  /**
   * Real, already-present column data (Shipping Country, falling back to
   * Billing Country) — not fabricated. `undefined` when neither column is
   * present in the export (older/customized exports); the tax-decision
   * pipeline downstream (Phase 3) treats that as missing evidence and
   * correctly returns BLOCKED/MISSING_TAX_EVIDENCE rather than guessing.
   */
  customerCountry?: string;
  /**
   * Real customer name string (prefer Shipping Name, fallback Billing Name) —
   * distinct from hasBillingBlock/hasShippingBlock, which only track presence.
   * `undefined` when neither column carries a value; kept optional so exports
   * without these columns still import successfully.
   */
  customerName?: string;
  /** Parsed from the `Total` column, if present. Undefined when absent/unparseable. */
  totalPrice?: number;
  /** Parsed from the `Taxes` column, if present. Undefined when absent/unparseable. */
  taxAmount?: number;
  /**
   * Real `Email` column, if present in the export. Standard Shopify
   * orders-export column, not fabricated. `undefined` when the export
   * doesn't carry it.
   */
  customerEmail?: string;
  /**
   * Single readable line built from real address columns — prefer
   * `Shipping Address1/City/Zip/Province`, fall back to the equivalent
   * `Billing *` columns. Mirrors the existing single-field customerName
   * convention (rather than splitting into separate street/city/zip
   * columns — YAGNI, no consumer needs the parts separately). `undefined`
   * when neither shipping nor billing address columns carry any value.
   *
   * Note: no buyer tax ID (NIF/CIF) is captured anywhere in this connector
   * — that is not a standard Shopify orders-export column. See the
   * disclosed limitation comment at the invoice render site
   * (packages/core/src/invoicing.ts).
   */
  customerAddress?: string;
  /** Derived from Shopify's real `Lineitem requires shipping` column. */
  productNature?: 'ebook' | 'general';
  issues: Array<{ code: string; severity: 'HIGH' | 'BLOCKING'; message: string }>;
}

export interface ShopifyOrdersCsvEvidence { hash: string; orders: ShopifyOrderEvidence[]; }

const requiredHeaders = ['Name', 'Financial Status', 'Fulfillment Status', 'Created at', 'Lineitem quantity', 'Billing Name', 'Shipping Name'];

// Columns that only appear in the Ledger or Order-Transactions exports \u2014
// their presence signals the wrong file was fed to this connector, even if
// it happens to also carry some of the Orders required columns.
const ledgerOrTransactionsSignatureColumns = ['Checkout', 'Payout Status', 'Kind', 'Gateway'];

function parseHeaderLine(bytes: Uint8Array): string[] {
  const firstLine = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '').split('\n')[0]?.replace(/\r$/, '') ?? '';
  return firstLine.split(',');
}

/**
 * Signature-based validator: reports exactly which required Orders columns
 * are missing, and explicitly rejects Ledger/Order-Transactions exports
 * (distinct column signatures) instead of returning a generic failure.
 */
export function validateShopifyOrdersCsvSignature(headers: string[]): { valid: true } | { valid: false; missing: string[]; message?: string } {
  const headerSet = new Set(headers);
  const looksLikeOtherStream = ledgerOrTransactionsSignatureColumns.some((column) => headerSet.has(column));
  if (looksLikeOtherStream) {
    return { valid: false, missing: [], message: 'CSV parece ser de Order Transactions/Ledger, no de Orders' };
  }
  const missing = requiredHeaders.filter((header) => !headerSet.has(header));
  if (missing.length > 0) return { valid: false, missing };
  return { valid: true };
}

export function isShopifyOrdersCsvFile(bytes: Uint8Array): boolean {
  return validateShopifyOrdersCsvSignature(parseHeaderLine(bytes)).valid;
}

function buildAddressLine(record: Record<string, string>, prefix: 'Shipping' | 'Billing'): string | undefined {
  const parts = [record[`${prefix} Address1`], record[`${prefix} City`], record[`${prefix} Zip`], record[`${prefix} Province`]]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(', ') : undefined;
}

export function extractShopifyOrdersCsv(bytes: Uint8Array): ShopifyOrdersCsvEvidence {
  // BOM handling verified present and correct (`.replace(/^\uFEFF/, '')` below,
  // plus `bom: true` passed to csv-parse) \u2014 confirmed working, no change
  // needed here (SHOPIFY-01 Task 2 step 4).
  const source = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '');
  const signatureCheck = validateShopifyOrdersCsvSignature(source.slice(0, source.indexOf('\n')).replace(/\r$/, '').split(','));
  if (!signatureCheck.valid) {
    if (signatureCheck.message) throw new Error(signatureCheck.message);
    throw new Error(`Faltan columnas obligatorias: ${signatureCheck.missing.join(', ')}`);
  }
  const records = parse(source, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
  const orders = records.map((record): ShopifyOrderEvidence => {
    const orderId = record.Name;
    // No order-number regex (e.g. AI-\d+) exists here today \u2014 verified during
    // SHOPIFY-01; `orderId` remains a non-empty string with no prefix
    // assumptions. Do not reintroduce one.
    if (!orderId) throw new Error('Fila de pedido sin identificador');
    const commercialDate = record['Created at']?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    const quantity = Number(record['Lineitem quantity']);
    const issues: ShopifyOrderEvidence['issues'] = [];
    if (!commercialDate) issues.push({ code: 'COMMERCIAL_DATE_MISSING', severity: 'HIGH', message: 'No se detectó una fecha comercial válida' });
    if (!Number.isFinite(quantity) || quantity <= 0) issues.push({ code: 'ITEM_QUANTITY_MISSING', severity: 'HIGH', message: 'No se detectó una cantidad de artículos válida' });
    // El export de pedidos no incluye un recuento "entregado de un total" como el
    // extracto en PDF que sustituye; la incoherencia equivalente aquí es un pedido
    // marcado como cumplido (entregado) cuyo estado financiero es un reembolso
    // total — mercancía servida sin ingreso neto, la misma señal de riesgo que
    // antes detectaba una cantidad entregada mayor que la cantidad total.
    if (record['Financial Status'] === 'refunded' && record['Fulfillment Status'] === 'fulfilled') {
      issues.push({ code: 'INCOHERENT_QUANTITY', severity: 'HIGH', message: 'Pedido cumplido con reembolso total; cantidad servida incoherente con el neto comercial' });
    }
    const customerCountry = record['Shipping Country'] || record['Billing Country'] || undefined;
    const customerName = record['Shipping Name'] || record['Billing Name'] || undefined;
    const totalPrice = record.Total !== undefined && record.Total !== '' ? Number(record.Total) : undefined;
    const taxAmount = record.Taxes !== undefined && record.Taxes !== '' ? Number(record.Taxes) : undefined;
    const customerEmail = record.Email || undefined;
    const customerAddress = buildAddressLine(record, 'Shipping') ?? buildAddressLine(record, 'Billing');
    const requiresShipping = record['Lineitem requires shipping']?.trim().toLowerCase();
    const productNature = requiresShipping === 'false' ? 'ebook' : requiresShipping === 'true' ? 'general' : undefined;

    return {
      orderId,
      ...(commercialDate ? { commercialDate } : {}),
      quantity,
      hasBillingBlock: Boolean(record['Billing Name']),
      hasShippingBlock: Boolean(record['Shipping Name']),
      ...(customerCountry ? { customerCountry } : {}),
      ...(customerName ? { customerName } : {}),
      ...(totalPrice !== undefined && Number.isFinite(totalPrice) ? { totalPrice } : {}),
      ...(taxAmount !== undefined && Number.isFinite(taxAmount) ? { taxAmount } : {}),
      ...(customerEmail ? { customerEmail } : {}),
      ...(customerAddress ? { customerAddress } : {}),
      ...(productNature ? { productNature } : {}),
      issues,
    };
  });
  return { hash: createHash('sha256').update(bytes).digest('hex'), orders };
}
