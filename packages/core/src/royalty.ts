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
  averageUnitPrice?: number;
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

export interface RoyaltyFormatSummary {
  format: 'ebook' | 'impreso';
  orderCount: number;
  averageUnitPrice: number;
  averageProductionCost: number;
  totalRoyalties: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const average = (values: number[]) => (values.length === 0 ? 0 : round2(values.reduce((sum, value) => sum + value, 0) / values.length));

/**
 * Breaks down royalty lines by book format (ebook vs. impreso/tapa blanda),
 * excluding refunds (classification 'reembolso') and KENP page-read lines,
 * which carry no per-unit price or production cost.
 */
export function summarizeRoyaltyLinesByFormat(lines: RoyaltyLine[]): RoyaltyFormatSummary[] {
  const formats: Array<'ebook' | 'impreso'> = ['ebook', 'impreso'];
  return formats.map((format) => {
    const matching = lines.filter((line) => line.classification === format);
    return {
      format,
      orderCount: matching.length,
      averageUnitPrice: average(matching.map((line) => line.averageUnitPrice ?? 0)),
      averageProductionCost: average(matching.map((line) => line.productionCost ?? 0)),
      totalRoyalties: round2(matching.reduce((sum, line) => sum + line.amount, 0)),
    };
  });
}
