export type ConnectorId = 'shopify-orders' | 'shopify-order-transactions' | 'shopify-payments' | 'amazon-kdp-royalties';

/**
 * Job/preview status is an opaque string driven by this label map — never
 * hardcode a specific status value (e.g. the old 'PREVIEW_READY') anywhere
 * that renders it. The backend contract (FASE 03 Batch 1 design) can add or
 * rename statuses; unknown values fall back to the raw string.
 */
export { statusLabel } from "../lib/display-labels";

/**
 * The 8 issue codes from the FASE 03 contract. `blocking` mirrors the
 * Batch 1 design decision on which codes require explicit user
 * acknowledgement before `confirm` is allowed — the backend is the source of
 * truth at runtime (each issue may carry its own `blocking` flag), this map
 * is only the client-side fallback when the backend omits it.
 */
export const ISSUE_CODE_BLOCKING: Record<string, boolean> = {
  VAT_NUMBER_MISSING_FOR_B2B_SIGNAL: false,
  CROSS_BORDER_B2C_REVIEW: false,
  PLATFORM_TAX_DIFFERS_FROM_FISCAL_DECISION: true,
  KDP_COST_DOUBLE_COUNT_RISK: true,
  PAYOUT_EVIDENCE_MISSING: true,
  ORDER_TOTAL_MISMATCH: true,
  REFUND_EXCEEDS_ORIGINAL: true,
  MAPPING_VERSION_UNSUPPORTED: true,
  GROSS_FEE_NET_MISMATCH: true,
  PLATFORM_VAT_ZERO_UNVALIDATED: false,
  ORDER_EVIDENCE_MISSING: false,
  ORDER_TRANSACTION_STATUS_UNSUPPORTED: false,
};

export interface ImportIssue {
  id?: string;
  position: number;
  code: string;
  message: string;
  suggestedAction: string;
  blocking?: boolean;
}

export function isBlockingIssue(issue: ImportIssue): boolean {
  return issue.blocking ?? ISSUE_CODE_BLOCKING[issue.code] ?? true;
}

export function issueKey(issue: ImportIssue): string {
  return issue.id ?? `${issue.position}-${issue.code}`;
}

export interface RoyaltyLine {
  isbnOrAsin: string;
  title?: string;
  classification: string;
  unitsNet?: number;
  amount: number;
  currency: string;
  format?: string;
  date?: string;
}

export interface CommercialOrderPreview {
  externalOrderId: string;
  commercialDate?: string;
  customerName?: string;
  totalAmount?: string;
  taxAmount?: string;
  productNature?: string;
}

export interface PreviewResponse {
  jobId: string;
  connector: string;
  status: string;
  summary: {
    records: number;
    issues: number;
    orderIds: string[];
    alreadyImportedCount?: number;
    allAlreadyImported?: boolean;
  };
  issues: ImportIssue[];
  royalty?: { statement: { periods: string[] }; lines: RoyaltyLine[] };
  commercialOrders?: CommercialOrderPreview[];
  shopifyOrders?: { orders: Array<CommercialOrderPreview & { orderName: string; financialStatus?: string; fulfillmentStatus?: string; lines: Array<{ title: string; quantity: string; unitPrice: string; discountAmount: string; subtotalAmount: string }> }> };
  shopifyOrderTransactions?: { events: Array<{ orderId: string; orderName: string; kind: string; status: string; amount: string; currency: string; occurredAt: string; gateway?: string; paymentMethod?: string }> };
  shopifyPaymentsLedger?: { entries: Array<{ orderName: string; entryType: string; amount: string; feeAmount: string; netAmount: string; currency: string; payoutStatus: string; payoutDate?: string | null; externalPayoutId?: string | null }> };
}

export interface ConfirmResponse {
  jobId: string;
  status: string;
  createdRecordIds: Record<string, string[]>;
}

export interface RejectResponse {
  jobId: string;
  status: string;
}
