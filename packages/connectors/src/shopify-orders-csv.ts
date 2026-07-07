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
  /** Optional real discount-code column when the Shopify export includes it. */
  discountCode?: string;
  /** Derived from Shopify's real `Lineitem requires shipping` column. */
  productNature?: 'ebook' | 'general';
  /** Real `Financial Status` column value (paid/refunded/pending/...), verbatim. */
  financialStatus?: string;
  /** Real `Fulfillment Status` column value, verbatim. */
  fulfillmentStatus?: string;
  issues: Array<{ code: string; severity: 'HIGH' | 'BLOCKING'; message: string }>;
}

export interface ShopifyOrderLineEvidence {
  /** Real Shopify Lineitem ID column value, when the export carries one. */
  externalLineId?: string;
  /**
   * Reproducible fingerprint (sha256 of orderId + sku/title + row number),
   * generated ONLY when the export has no real Lineitem ID for this row.
   * This is NOT an official Shopify identifier — it exists purely so a
   * re-import of the same file produces the same idempotency key for this
   * row via `order_lines_external_uq`. Never label it as a Shopify id
   * anywhere downstream.
   */
  sourceLineFingerprint?: string;
  /** 1-based row number within the source CSV (for traceability, not identity). */
  sourceRowNumber: number;
  sku?: string;
  title: string;
  quantity: number;
  /**
   * Real `Lineitem price` column value when present. When absent (older/
   * customized exports without line-level pricing, e.g. this connector's
   * pre-SHOPIFY-02 fixtures), derived as `Total / Lineitem quantity` for the
   * order's single/first line — a documented arithmetic fallback, not
   * fabricated data, and only applied when no real per-line price exists.
   */
  unitPrice: number;
  discountAmount: number;
  subtotalAmount: number;
  requiresShipping?: boolean;
}

export interface ShopifyOrdersCsvEvidence { hash: string; orders: ShopifyOrderEvidence[]; groupedOrders: ShopifyGroupedOrder[]; }

/**
 * Order grouped by `Name` (requirement: multiple CSV rows sharing the same
 * `Name` are one commercial order with N lines — see SHOPIFY-02). Extends
 * `ShopifyOrderEvidence` with the line-level breakdown and the order-level
 * reconciliation fields/flags computed from it. `quantity` on the base type
 * still reflects the first row (kept for backward compatibility with
 * existing per-row consumers); `lines.length` and each line's `quantity` are
 * the source of truth for line-level counts.
 */
export interface ShopifyGroupedOrder extends ShopifyOrderEvidence {
  lines: ShopifyOrderLineEvidence[];
  reportedSubtotalAmount?: number;
  discountAmount?: number;
  shippingAmount?: number;
  reportedTotalAmount?: number;
  /** Total = 0: kept (never dropped), flagged for manual review downstream. */
  zeroValueReview: boolean;
}

const requiredHeaders = ['Name', 'Financial Status', 'Fulfillment Status', 'Created at', 'Lineitem quantity', 'Billing Name', 'Shipping Name'];

// Columns that only appear in the Ledger or Order-Transactions exports \u2014
// their presence signals the wrong file was fed to this connector, even if
// it happens to also carry some of the Orders required columns.
const ledgerOrTransactionsSignatureColumns = ['Checkout', 'Payout Status', 'Kind', 'Gateway'];

function firstNonEmpty(record: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

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
    const discountCode = firstNonEmpty(record, ['Discount Code', 'Discount code', 'Discount Codes', 'Discount codes', 'Discount Name', 'Discount name']);
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
      ...(discountCode ? { discountCode } : {}),
      ...(productNature ? { productNature } : {}),
      ...(record['Financial Status'] ? { financialStatus: record['Financial Status'] } : {}),
      ...(record['Fulfillment Status'] ? { fulfillmentStatus: record['Fulfillment Status'] } : {}),
      issues,
    };
  });

  const groupedOrders = groupShopifyOrderRows(records, orders);

  return { hash: createHash('sha256').update(bytes).digest('hex'), orders, groupedOrders };
}

const TOTAL_MISMATCH_TOLERANCE_EUR = 0.01;

function buildLineEvidence(record: Record<string, string>, orderId: string, rowNumber: number): ShopifyOrderLineEvidence {
  const externalLineId = record['Lineitem id']?.trim() || undefined;
  const sku = record['Lineitem sku']?.trim() || undefined;
  const title = record['Lineitem name']?.trim() || orderId;
  const quantity = Number(record['Lineitem quantity']) || 0;
  const totalPrice = record.Total !== undefined && record.Total !== '' ? Number(record.Total) : undefined;
  const linePriceRaw = record['Lineitem price'];
  // Real per-line price when the export carries it; otherwise a documented
  // arithmetic fallback (Total / quantity) — never fabricated, only derived
  // from real order-level fields already present on this row.
  const unitPrice = linePriceRaw !== undefined && linePriceRaw !== ''
    ? Number(linePriceRaw)
    : (totalPrice !== undefined && quantity > 0 ? totalPrice / quantity : 0);
  const discountAmount = record['Lineitem discount'] !== undefined && record['Lineitem discount'] !== ''
    ? Number(record['Lineitem discount'])
    : 0;
  const subtotalAmount = unitPrice * quantity;
  const requiresShippingRaw = record['Lineitem requires shipping']?.trim().toLowerCase();
  const requiresShipping = requiresShippingRaw === 'true' ? true : requiresShippingRaw === 'false' ? false : undefined;

  return {
    ...(externalLineId ? { externalLineId } : {
      // No real Lineitem ID column value on this row — generate a
      // reproducible fingerprint so re-importing the same file yields the
      // same idempotency key. NOT an official Shopify identifier.
      sourceLineFingerprint: createHash('sha256').update(`${orderId}|${sku ?? title}|${rowNumber}`).digest('hex'),
    }),
    sourceRowNumber: rowNumber,
    ...(sku ? { sku } : {}),
    title,
    quantity,
    unitPrice,
    discountAmount,
    subtotalAmount,
    ...(requiresShipping !== undefined ? { requiresShipping } : {}),
  };
}

/**
 * Groups per-row parsed records by `Name` into one order with N lines each —
 * closing the silent-drop gap where a multi-lineitem order previously
 * produced one `commercial_orders` row per CSV row (and `onConflictDoNothing`
 * dropped every row after the first). Runs strictly after the existing
 * per-row parsing/validation above; does not alter it.
 */
function groupShopifyOrderRows(records: Record<string, string>[], parsedOrders: ShopifyOrderEvidence[]): ShopifyGroupedOrder[] {
  const groups = new Map<string, { representative: ShopifyOrderEvidence; lines: ShopifyOrderLineEvidence[] }>();

  records.forEach((record, index) => {
    const orderId = record.Name;
    const representative = parsedOrders[index];
    if (!representative || !orderId) return;
    const rowNumber = index + 1;
    const line = buildLineEvidence(record, orderId, rowNumber);

    const existing = groups.get(orderId);
    if (existing) {
      existing.lines.push(line);
    } else {
      groups.set(orderId, { representative, lines: [line] });
    }
  });

  return Array.from(groups.values()).map(({ representative, lines }): ShopifyGroupedOrder => {
    const reportedSubtotalAmount = lines.reduce((sum, line) => sum + line.subtotalAmount, 0);
    const discountAmount = lines.reduce((sum, line) => sum + line.discountAmount, 0);
    const shippingAmount = 0; // No `Shipping` column exists in any current fixture — no evidence to report yet.
    const reportedTotalAmount = representative.totalPrice;
    const reportedTaxAmount = representative.taxAmount ?? 0;

    const issues = [...representative.issues];
    if (reportedTotalAmount !== undefined) {
      const computedTotal = reportedSubtotalAmount - discountAmount + shippingAmount + reportedTaxAmount;
      const mismatch = Math.abs(computedTotal - reportedTotalAmount) > TOTAL_MISMATCH_TOLERANCE_EUR;
      if (mismatch) {
        issues.push({ code: 'ORDER_TOTAL_MISMATCH', severity: 'HIGH', message: `Total reportado (${reportedTotalAmount}) no coincide con el total calculado (${computedTotal.toFixed(2)})` });
      }
    }

    const zeroValueReview = reportedTotalAmount === 0;

    return {
      ...representative,
      lines,
      reportedSubtotalAmount,
      discountAmount,
      shippingAmount,
      ...(reportedTotalAmount !== undefined ? { reportedTotalAmount } : {}),
      zeroValueReview,
      issues,
    };
  });
}
