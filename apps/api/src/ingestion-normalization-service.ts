import type { ShopifyCsvPreview, ShopifyGroupedOrder, ShopifyOrderTransactionsEvidence } from '@anclora/connectors';
import type { NewCommercialOrder, NewFinancialEvent, NewOrderLine, NewShopifyOrderPaymentEvent, NewShopifyPaymentsLedgerEntry } from '@anclora/db';

const SOURCE_CHANNEL = 'SHOPIFY';

export type NewCommercialOrderWithoutTenant = Omit<NewCommercialOrder, 'tenantId'>;
export type NewFinancialEventWithoutTenant = Omit<NewFinancialEvent, 'tenantId'>;
export type NewOrderLineWithoutTenant = Omit<NewOrderLine, 'tenantId' | 'commercialOrderId'>;
/**
 * SHOPIFY-03: `commercialOrderId` is deliberately excluded here -- it can
 * only be resolved against the real persisted `commercial_orders` table at
 * confirm time (via CommercialOrdersRepositoryPort.findByExternalOrderId
 * using `shopifyOrderName`), never at preview time. The persistence layer
 * (import-preview-persistence.ts) fills it in per row before insert.
 */
export type NewShopifyOrderPaymentEventWithoutTenant = Omit<NewShopifyOrderPaymentEvent, 'tenantId' | 'importFileId' | 'commercialOrderId'>;
export type NewShopifyPaymentsLedgerEntryWithoutTenant = Omit<NewShopifyPaymentsLedgerEntry, 'tenantId' | 'importFileId' | 'commercialOrderId'>;

/**
 * SHOPIFY-02: one grouped order (order-level fields) plus its normalized
 * order_lines rows, keyed by the order's own externalOrderId so the
 * persistence layer can resolve the parent id after insert/lookup.
 */
export interface NormalizedShopifyOrderGroup {
  order: NewCommercialOrderWithoutTenant;
  lines: NewOrderLineWithoutTenant[];
}

/**
 * Maps a single grouped Shopify order (SHOPIFY-02 — rows already collapsed
 * by `Name` in the connector) into a commercial_orders row plus its
 * order_lines rows. Replaces the prior one-CSV-row-per-order mapping, which
 * silently dropped every row after the first for a multi-lineitem order
 * (onConflictDoNothing on externalOrderId).
 */
export function normalizeShopifyGroupedOrder(order: ShopifyGroupedOrder): NormalizedShopifyOrderGroup {
  return {
    order: {
      sourceChannel: SOURCE_CHANNEL,
      externalOrderId: order.orderId,
      commercialDate: order.commercialDate ? new Date(order.commercialDate) : undefined,
      // Real, already-present evidence (Shipping/Billing Country) — undefined
      // when the export doesn't carry it, which is the honest signal that lets
      // the tax-decision service (Phase 3) correctly return
      // BLOCKED/MISSING_TAX_EVIDENCE instead of guessing a country.
      customerCountry: order.customerCountry,
      // Documented business-rule default, not fabricated per-row data: this
      // connector processes a direct-to-consumer Shopify storefront export —
      // there is no B2B/reseller distinction anywhere in the source data.
      customerType: 'B2C',
      productNature: order.productNature ?? 'general',
      customerName: order.customerName,
      totalAmount: order.totalPrice !== undefined ? String(order.totalPrice) : undefined,
      taxAmount: order.taxAmount !== undefined ? String(order.taxAmount) : undefined,
      customerEmail: order.customerEmail,
      customerAddress: order.customerAddress,
      // Real `Financial Status`/`Fulfillment Status` columns, verbatim.
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      // Raw as-reported reconciliation fields (SHOPIFY-02) — distinct from
      // totalAmount/taxAmount above, which remain the canonical/reconciled
      // fields consumed by matching/tax-decision. Never auto-corrected even
      // when ORDER_TOTAL_MISMATCH fires.
      reportedSubtotalAmount: order.reportedSubtotalAmount !== undefined ? String(order.reportedSubtotalAmount) : undefined,
      discountAmount: order.discountAmount !== undefined ? String(order.discountAmount) : undefined,
      shippingAmount: order.shippingAmount !== undefined ? String(order.shippingAmount) : undefined,
      reportedTotalAmount: order.reportedTotalAmount !== undefined ? String(order.reportedTotalAmount) : undefined,
      // Total=0: kept, flagged for manual review — never dropped, never
      // auto-emitted. Note: no existing emission gate in this codebase reads
      // commercial_orders.fiscalStatus today (issuance is driven by
      // canonical_operations/anomalyFlags — see invoice-issuance-service.ts);
      // this value is the documented marker for a future gate, not a
      // currently-wired block.
      ...(order.zeroValueReview ? { fiscalStatus: 'ZERO_VALUE_REVIEW' } : {}),
    },
    lines: order.lines.map((line): NewOrderLineWithoutTenant => ({
      // externalLineId reused as the idempotency key: the real Shopify
      // Lineitem ID when present, or the fingerprint when it's not (per
      // SHOPIFY-02 — the fingerprint is NOT an official Shopify id, see
      // shopify-orders-csv.ts).
      externalLineId: line.externalLineId ?? line.sourceLineFingerprint,
      sourceLineFingerprint: line.sourceLineFingerprint,
      sourceRowNumber: line.sourceRowNumber,
      sku: line.sku,
      title: line.title,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      discountAmount: String(line.discountAmount),
      subtotalAmount: String(line.subtotalAmount),
      requiresShipping: line.requiresShipping,
    })),
  };
}

/**
 * Maps a full parsed shopify-orders-csv evidence extraction (all grouped
 * orders) into normalized order groups, ready for
 * DrizzleCommercialOrdersRepository.createManyWithLines.
 */
export function normalizeShopifyOrdersCsv(groupedOrders: ShopifyGroupedOrder[]): NormalizedShopifyOrderGroup[] {
  return groupedOrders.map(normalizeShopifyGroupedOrder);
}

/**
 * Maps parsed shopify-csv (payment transactions) rows into financial_events
 * rows. Uses the connector's already-computed businessKey (a hash of
 * order+checkout+date+type+amount+currency) as the externalEventId so
 * re-importing an identical file produces identical ids for the DB's unique
 * constraint to dedupe against.
 */
export function normalizeShopifyPaymentTransactions(preview: ShopifyCsvPreview): NewFinancialEventWithoutTenant[] {
  return preview.rows.map((row) => ({
    sourceChannel: SOURCE_CHANNEL,
    externalEventId: row.businessKey,
    eventType: row.kind,
    orderReference: row.Order,
    checkoutReference: row.Checkout,
    amount: row.Amount,
    feeAmount: row.Fee,
    netAmount: row.Net,
    currency: row.Currency,
    occurredAt: new Date(row['Transaction Date']),
  }));
}

/**
 * SHOPIFY-03: maps parsed shopify-order-transactions-csv rows (sale/refund/
 * authorization/capture/void events) into shopify_order_payment_events rows.
 * `shopifyOrderId` stores the connector's raw numeric `order` value verbatim
 * for evidence only -- it carries no FK meaning (see migration 0014's
 * linkage-field note); `shopifyOrderName` (the connector's `name` field) is
 * the real join key resolved against commercial_orders at persist time.
 * `minimizedSnapshot` deliberately whitelists only non-PII fields (kind,
 * gateway, status, amount, currency, card brand/method) -- no customer name,
 * email, or full card number is ever included.
 */
export function normalizeShopifyOrderTransactions(evidence: ShopifyOrderTransactionsEvidence): NewShopifyOrderPaymentEventWithoutTenant[] {
  return evidence.rows.map((row) => ({
    externalEventKey: row.businessKey,
    shopifyOrderId: row.order,
    shopifyOrderName: row.name,
    kind: row.kind,
    gateway: row.gateway,
    status: row.status,
    amount: String(row.amount),
    currency: row.currency,
    cardType: row.cardType,
    paymentMethod: row.paymentMethod,
    occurredAt: new Date(row.createdAt),
    minimizedSnapshot: {
      kind: row.kind,
      gateway: row.gateway,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      ...(row.cardType ? { cardType: row.cardType } : {}),
      ...(row.paymentMethod ? { paymentMethod: row.paymentMethod } : {}),
    },
  }));
}

/**
 * SHOPIFY-03: maps parsed shopify-payments-ledger-csv rows (platform
 * settlement ledger, distinct from the financial_events matching pipeline)
 * into shopify_payments_ledger_entries rows. `platformVatAmount` is stored
 * as-is for evidence only -- never read by any fiscal-decision path.
 * `externalPayoutId` presence (Payout ID column) is what the persistence/
 * repository layer uses to decide whether a real `payouts` row should be
 * created -- absent here means evidence-only/pending settlement.
 */
export function normalizeShopifyPaymentsLedger(preview: ShopifyCsvPreview): NewShopifyPaymentsLedgerEntryWithoutTenant[] {
  return preview.rows.map((row, index) => ({
    externalEntryKey: row.businessKey,
    shopifyOrderName: row.Order,
    checkoutReference: row.Checkout,
    entryType: row.kind,
    transactionAt: new Date(row['Transaction Date']),
    amount: row.Amount,
    feeAmount: row.Fee,
    netAmount: row.Net,
    currency: row.Currency,
    presentmentAmount: row['Presentment Amount'],
    presentmentCurrency: row['Presentment Currency'],
    platformVatAmount: row.VAT,
    cardBrand: row['Card Brand'],
    cardSource: row['Card Source'],
    paymentMethod: row['Payment Method Name'],
    payoutStatus: row['Payout Status'],
    payoutDate: row['Payout Date'] || undefined,
    availableOn: row['Available On'] || undefined,
    externalPayoutId: row['Payout ID'] || undefined,
    sourceRowNumber: index + 2,
    minimizedSnapshot: {
      entryType: row.kind,
      amount: row.Amount,
      feeAmount: row.Fee,
      netAmount: row.Net,
      currency: row.Currency,
      cardBrand: row['Card Brand'],
    },
  }));
}
