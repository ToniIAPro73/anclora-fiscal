/**
 * FASE 03 issue codes -- single source of truth for both the API (write
 * path, `import_errors.code`) and the frontend (read path, human-readable
 * copy + suggested action per code). No `packages/shared` exists in this
 * monorepo, so this lives in `packages/db` (already a shared dependency of
 * both `apps/api` and `apps/web`) rather than duplicating the list.
 */
export const IMPORT_ISSUE_CODES = [
  'VAT_NUMBER_MISSING_FOR_B2B_SIGNAL',
  'CROSS_BORDER_B2C_REVIEW',
  'PLATFORM_TAX_DIFFERS_FROM_FISCAL_DECISION',
  'KDP_COST_DOUBLE_COUNT_RISK',
  'PAYOUT_EVIDENCE_MISSING',
  'ORDER_TOTAL_MISMATCH',
  'REFUND_EXCEEDS_ORIGINAL',
  'MAPPING_VERSION_UNSUPPORTED',
  'GROSS_FEE_NET_MISMATCH',
  'PLATFORM_VAT_ZERO_UNVALIDATED',
  'ORDER_EVIDENCE_MISSING',
  'ORDER_TRANSACTION_STATUS_UNSUPPORTED',
  'EXPENSE_NUMBER_MISSING',
  'EXPENSE_DATE_INVALID',
  'EXPENSE_TOTAL_INCOHERENT',
  'EXPENSE_CATEGORY_UNKNOWN',
] as const;

export type ImportIssueCode = (typeof IMPORT_ISSUE_CODES)[number];

export const IMPORT_CONNECTOR_IDS = ['shopify-orders', 'shopify-order-transactions', 'shopify-payments', 'amazon-kdp-royalties', 'expenses-csv'] as const;

export type ImportConnectorId = (typeof IMPORT_CONNECTOR_IDS)[number];

/** Which connector(s) each issue code applies to. */
export const IMPORT_ISSUE_CODE_CONNECTORS: Record<ImportIssueCode, readonly ImportConnectorId[]> = {
  VAT_NUMBER_MISSING_FOR_B2B_SIGNAL: ['shopify-orders'],
  CROSS_BORDER_B2C_REVIEW: ['shopify-orders'],
  PLATFORM_TAX_DIFFERS_FROM_FISCAL_DECISION: ['shopify-orders', 'amazon-kdp-royalties'],
  KDP_COST_DOUBLE_COUNT_RISK: ['amazon-kdp-royalties'],
  PAYOUT_EVIDENCE_MISSING: ['shopify-payments'],
  ORDER_TOTAL_MISMATCH: ['shopify-orders'],
  REFUND_EXCEEDS_ORIGINAL: ['shopify-orders', 'amazon-kdp-royalties'],
  MAPPING_VERSION_UNSUPPORTED: ['shopify-orders', 'shopify-payments', 'amazon-kdp-royalties'],
  GROSS_FEE_NET_MISMATCH: ['shopify-payments'],
  PLATFORM_VAT_ZERO_UNVALIDATED: ['shopify-payments'],
  ORDER_EVIDENCE_MISSING: ['shopify-order-transactions'],
  ORDER_TRANSACTION_STATUS_UNSUPPORTED: ['shopify-order-transactions'],
  EXPENSE_NUMBER_MISSING: ['expenses-csv'],
  EXPENSE_DATE_INVALID: ['expenses-csv'],
  EXPENSE_TOTAL_INCOHERENT: ['expenses-csv'],
  EXPENSE_CATEGORY_UNKNOWN: ['expenses-csv'],
};

export function isImportIssueCode(value: string): value is ImportIssueCode {
  return (IMPORT_ISSUE_CODES as readonly string[]).includes(value);
}

export function isImportConnectorId(value: string): value is ImportConnectorId {
  return (IMPORT_CONNECTOR_IDS as readonly string[]).includes(value);
}
