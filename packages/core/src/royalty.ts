// Amazon KDP (and future royalty-bearing marketplaces) are merchant of record
// for sales to end readers (spec principle #7) — royalty rows are modeled as
// RoyaltyStatement/RoyaltyLine, never as CanonicalOperation invoices issued to
// the reader. See docs/decision-log.md.

export type RoyaltyLineClassification =
  | 'ebook'
  | 'impreso'
  | 'coste_produccion'
  | 'regalia'
  | 'venta_marketplace'
  | 'reembolso'
  | 'ajuste'
  | 'liquidacion'
  | 'kenp_lectura';

export type RoyaltyLineStatus = 'RECOGNIZED' | 'PENDING_TAX_REVIEW';

export interface RoyaltyLine {
  businessKey: string;
  classification: RoyaltyLineClassification;
  status: RoyaltyLineStatus;
  period: string;
  title?: string;
  isbnOrAsin: string;
  store?: string;
  unitsSold?: number;
  unitsReturned?: number;
  unitsNet?: number;
  amount: number;
  currency: string;
  productionCost?: number;
  kenpPages?: number;
  sourceSheet: string;
}

export interface RoyaltyStatement {
  hash: string;
  sourceConnector: 'kdp';
  currency: string;
  periods: string[];
  totalRoyalties: number;
  lineCount: number;
}
