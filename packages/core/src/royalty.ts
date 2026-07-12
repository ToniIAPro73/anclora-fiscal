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
  /**
   * The book's real format (ebook/impreso), captured BEFORE `classification`
   * is overridden to 'reembolso' for returned-units rows. Kept independent of
   * `classification` so a refund line still carries its true ebook/impreso
   * format for grouping/netting purposes (see kdp-xlsx.ts's DETAIL_SHEETS loop).
   */
  format?: 'ebook' | 'impreso';
  /** Full ISO date (YYYY-MM-DD) for the transaction, distinct from the month-level `period`. */
  date?: string;
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
export interface ExchangeRateSnapshot { source: string; date: string; base: string; quote: 'EUR'; rate: number }
export interface ExchangeRatePort { getRate(input: { source: string; date: string; base: string; quote: 'EUR' }): Promise<ExchangeRateSnapshot | null> }
export interface RoyaltyAdvisorySummary { marketplace: string; format: string; currency: string; royalties: number; productionCosts: number; netInformative: number; eurInformative: number | null; warning?: string }
export function summarizeRoyaltyAdvisory(lines: RoyaltyLine[], rates: ExchangeRateSnapshot[]): RoyaltyAdvisorySummary[] {
  const groups = new Map<string, RoyaltyAdvisorySummary>();
  for (const line of lines) { const format = line.format ?? line.classification; const marketplace = line.store ?? 'UNKNOWN'; const key = `${marketplace}|${format}|${line.currency}`; const item = groups.get(key) ?? { marketplace, format, currency: line.currency, royalties: 0, productionCosts: 0, netInformative: 0, eurInformative: null }; item.royalties += line.amount; item.productionCosts += line.productionCost ?? 0; item.netInformative = round2(item.royalties - item.productionCosts); const rate = rates.filter((candidate) => candidate.base === line.currency && candidate.quote === 'EUR' && candidate.date <= (line.date ?? `${line.period}-01`)).sort((a,b) => b.date.localeCompare(a.date))[0]; item.eurInformative = line.currency === 'EUR' ? item.netInformative : rate ? round2(item.netInformative * rate.rate) : null; if (!rate && line.currency !== 'EUR') item.warning = 'Tipo histórico ausente; conversión EUR no calculada'; groups.set(key,item); }
  return [...groups.values()].sort((a,b) => `${a.marketplace}|${a.format}|${a.currency}`.localeCompare(`${b.marketplace}|${b.format}|${b.currency}`));
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
