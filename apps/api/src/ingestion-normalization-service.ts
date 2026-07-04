import type { ShopifyCsvPreview, ShopifyOrdersCsvEvidence } from '@anclora/connectors';
import type { NewCommercialOrder, NewFinancialEvent } from '@anclora/db';

const SOURCE_CHANNEL = 'SHOPIFY';

export type NewCommercialOrderWithoutTenant = Omit<NewCommercialOrder, 'tenantId'>;
export type NewFinancialEventWithoutTenant = Omit<NewFinancialEvent, 'tenantId'>;

/**
 * Maps a parsed shopify-orders-csv evidence extraction into commercial_orders
 * rows. The orders export carries no checkout reference (that only exists on
 * the payment-transactions export) — matching (Phase 2) joins on
 * externalOrderId/orderReference instead.
 */
export function normalizeShopifyOrdersCsv(evidence: ShopifyOrdersCsvEvidence): NewCommercialOrderWithoutTenant[] {
  return evidence.orders.map((order) => ({
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
    // Documented known limitation: no product/SKU category data flows
    // through the pipeline yet, so every order is treated as the coarsest
    // possible "general" rate rather than a reduced rate (e.g. ebook).
    // Revisit only if/when a product-catalog import is added.
    productNature: 'general',
  }));
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
