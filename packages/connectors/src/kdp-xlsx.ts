import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { RoyaltyLine, RoyaltyLineClassification, RoyaltyStatement } from '@anclora/core';

// -- Sheet names -------------------------------------------------------------
// Amazon KDP exports one trailing-space sheet name
// ("Regalías de los libros de tapa "). All lookups go through
// normalizeSheetName()/buildSheetLookup() so no call site hardcodes the exact
// byte sequence.
export const SHEET_DEFINICIONES = 'Definiciones del informe';
export const SHEET_RESUMEN = 'Resumen';
export const SHEET_VENTAS_COMBINADAS = 'Ventas combinadas';
export const SHEET_EBOOKS = 'Regalías de eBooks';
export const SHEET_IMPRESOS = 'Regalías de libros impresos';
export const SHEET_TAPA_DURA = 'Regalías de los libros de tapa';
export const SHEET_PEDIDOS_PROCESADOS = 'Pedidos procesados';
export const SHEET_PEDIDOS_EBOOKS = 'Pedidos completados de eBooks';
export const SHEET_KENP = 'KENP leídas';

export function normalizeSheetName(name: string): string {
  return name.trim();
}

function buildSheetLookup(sheetNames: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of sheetNames) map.set(normalizeSheetName(name), name);
  return map;
}

const KNOWN_KDP_SHEETS = [
  SHEET_DEFINICIONES, SHEET_RESUMEN, SHEET_VENTAS_COMBINADAS, SHEET_EBOOKS,
  SHEET_IMPRESOS, SHEET_TAPA_DURA, SHEET_PEDIDOS_PROCESADOS, SHEET_PEDIDOS_EBOOKS, SHEET_KENP,
];

const MAX_KDP_ROWS_PER_SHEET = 10_000;

/**
 * Positive signature for import-service dispatch: an .xlsx file only routes to
 * this connector if it also contains at least one known KDP sheet name
 * (trimmed) — extension/mimetype alone is not sufficient, since other xlsx
 * imports may exist in the future.
 */
export function isKdpXlsxWorkbook(sheetNames: string[]): boolean {
  const normalized = new Set(sheetNames.map(normalizeSheetName));
  return KNOWN_KDP_SHEETS.some((sheet) => normalized.has(sheet));
}

/** Reads only the sheet names from raw bytes to decide dispatch without a full parse. */
export function isKdpXlsxFile(bytes: Uint8Array): boolean {
  const workbook = XLSX.read(Buffer.from(bytes), { type: 'buffer', bookSheets: true });
  return isKdpXlsxWorkbook(workbook.SheetNames);
}

// -- Spanish month parser ------------------------------------------------------
const SPANISH_MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

export function parseSpanishMonth(text: string): string {
  const match = /^([a-záéíóúñ]+)\s+(\d{4})$/i.exec(text.trim());
  const monthName = match?.[1];
  const year = match?.[2];
  const month = monthName ? SPANISH_MONTHS[monthName.toLowerCase()] : undefined;
  if (!month || !year) throw new Error(`Mes en español no reconocido: "${text}"`);
  return `${year}-${month}`;
}

// -- Per-sheet Zod schemas -----------------------------------------------------
// Definiciones del informe is intentionally never validated/normalized (spec §5).

export const kdpResumenRowSchema = z.object({
  Fecha: z.string().refine((value) => {
    try { parseSpanishMonth(value); return true; } catch { return false; }
  }, 'Mes en español no reconocido'),
  'Unidades netas vendidas (eBook)': z.number(),
  'Unidades gratuitas vendidas (eBook)': z.number(),
  'Unidades netas vendidas (Tapa blanda)': z.number(),
  'Unidades netas vendidas (tapa dura)': z.number(),
  'Préstamos de KOLL': z.union([z.number(), z.literal('N/A')]),
  'Páginas KENP leídas': z.number(),
  'Regalías (USD)': z.number(),
  'Regalías (GBP)': z.number(),
  'Regalías (EUR)': z.number(),
  'Regalías (JPY)': z.number(),
  'Regalías (CAD)': z.number(),
  'Regalías (INR)': z.number(),
  'Regalías (PLN)': z.number(),
  'Regalías (SEK)': z.number(),
  'Regalías (BRL)': z.number(),
  'Regalías (MXN)': z.number(),
  'Regalías (AUD)': z.number(),
}).strict();
export type KdpResumenRow = z.infer<typeof kdpResumenRowSchema>;

export const kdpVentasCombinadasRowSchema = z.object({
  'Fecha de las regalías': z.string(),
  Título: z.string(),
  'Nombre del autor': z.string(),
  'ASIN/ISBN': z.string(),
  Tienda: z.string(),
  'Tipo de regalía': z.string(),
  'Tipo de transacción': z.string(),
  'Unidades vendidas': z.number(),
  'Unidades devueltas': z.number(),
  'Unidades netas vendidas': z.number(),
  'Precio de lista medio sin impuestos': z.number(),
  'Precio de oferta medio sin impuestos': z.number(),
  'Gasto medio de entrega/producción': z.number(),
  Regalías: z.number(),
  Moneda: z.string(),
}).strict();
export type KdpVentasCombinadasRow = z.infer<typeof kdpVentasCombinadasRowSchema>;

export const kdpEbookRoyaltyRowSchema = z.object({
  'Fecha de las regalías': z.string(),
  Título: z.string(),
  'Nombre del autor': z.string(),
  ASIN: z.string(),
  Tienda: z.string(),
  'Tipo de regalía': z.string(),
  'Tipo de transacción': z.string(),
  'Unidades vendidas': z.number(),
  'Unidades devueltas': z.number(),
  'Unidades netas vendidas': z.number(),
  'Precio de lista medio sin impuestos': z.number(),
  'Precio de oferta medio sin impuestos': z.number(),
  'Tamaño medio del archivo (MB)': z.number(),
  'Gasto medio de envío': z.number(),
  Regalías: z.number(),
  Moneda: z.string(),
}).strict();
export type KdpEbookRoyaltyRow = z.infer<typeof kdpEbookRoyaltyRowSchema>;

export const kdpImpresoRoyaltyRowSchema = z.object({
  'Fecha de las regalías': z.string(),
  'Fecha de pedido': z.string(),
  Título: z.string(),
  'Nombre del autor': z.string(),
  ISBN: z.string(),
  Tienda: z.string(),
  'Tipo de regalía': z.string(),
  'Tipo de transacción': z.string(),
  'Unidades vendidas': z.number(),
  'Unidades devueltas': z.number(),
  'Unidades netas vendidas': z.number(),
  'Precio de lista medio sin impuestos': z.number(),
  'Precio de oferta medio sin impuestos': z.number(),
  'Gasto de producción medio': z.number(),
  Regalías: z.number(),
  Moneda: z.string(),
  ASIN: z.string(),
}).strict();
export type KdpImpresoRoyaltyRow = z.infer<typeof kdpImpresoRoyaltyRowSchema>;

export const kdpPedidosProcesadosRowSchema = z.object({
  Fecha: z.string(),
  Título: z.string(),
  'Nombre del autor': z.string(),
  ASIN: z.string(),
  Tienda: z.string(),
  'Unidades pagadas': z.number(),
  'Unidades gratuitas': z.number(),
}).strict();
export type KdpPedidosProcesadosRow = z.infer<typeof kdpPedidosProcesadosRowSchema>;

export const kdpKenpRowSchema = z.object({
  Fecha: z.string(),
  Título: z.string(),
  'Nombre del autor': z.string(),
  ASIN: z.string(),
  Tienda: z.string(),
  'Páginas KENP leídas': z.number(),
}).strict();
export type KdpKenpRow = z.infer<typeof kdpKenpRowSchema>;

// -- Preview types --------------------------------------------------------------
export interface KdpXlsxIssue { sheet: string; row?: number; code: string; severity: 'INFO' | 'WARNING' | 'HIGH' | 'BLOCKING'; message: string; }
export interface KdpXlsxPreview { hash: string; sheets: string[]; rows: RoyaltyLine[]; statement: RoyaltyStatement; issues: KdpXlsxIssue[]; }

const DETAIL_SHEETS = [SHEET_VENTAS_COMBINADAS, SHEET_EBOOKS, SHEET_IMPRESOS, SHEET_TAPA_DURA] as const;

function detectFormat(sheetKey: string, tipoTransaccion: string): 'ebook' | 'impreso' {
  if (sheetKey === SHEET_EBOOKS) return 'ebook';
  if (sheetKey === SHEET_IMPRESOS || sheetKey === SHEET_TAPA_DURA) return 'impreso';
  return /ebook/i.test(tipoTransaccion) ? 'ebook' : 'impreso';
}

interface DetailRowShape {
  'Fecha de las regalías': string;
  Título: string;
  'Nombre del autor': string;
  Tienda: string;
  'Tipo de transacción': string;
  'Unidades vendidas': number;
  'Unidades devueltas': number;
  'Unidades netas vendidas': number;
  Regalías: number;
  Moneda: string;
  isbnOrAsin: string;
  productionCost: number | undefined;
}

function buildBusinessKey(row: DetailRowShape, period: string): string {
  return createHash('sha256')
    .update([period, row.isbnOrAsin, row['Unidades netas vendidas'], row.Regalías, row.Moneda].join('|'))
    .digest('hex');
}

export function previewKdpXlsx(bytes: Uint8Array): KdpXlsxPreview {
  const workbook = XLSX.read(Buffer.from(bytes), {
    type: 'buffer',
    sheetRows: MAX_KDP_ROWS_PER_SHEET,
  });
  const lookup = buildSheetLookup(workbook.SheetNames);
  const issues: KdpXlsxIssue[] = [];

  const getSheet = (name: string) => {
    const actual = lookup.get(normalizeSheetName(name));
    return actual ? workbook.Sheets[actual] : undefined;
  };

  // Definiciones del informe is metadata-only — never parsed or validated.

  const resumenSheet = getSheet(SHEET_RESUMEN);
  const resumenByPeriod = new Map<string, number>();
  if (resumenSheet) {
    const rawRows = XLSX.utils.sheet_to_json(resumenSheet, { defval: null });
    rawRows.forEach((raw, index) => {
      const result = kdpResumenRowSchema.safeParse(raw);
      if (!result.success) {
        issues.push({ sheet: SHEET_RESUMEN, row: index + 2, code: 'INVALID_ROW', severity: 'BLOCKING', message: result.error.issues.map((issue) => issue.path.join('.')).join(', ') });
        return;
      }
      const period = parseSpanishMonth(result.data.Fecha);
      resumenByPeriod.set(period, result.data['Regalías (EUR)']);
    });
  }

  const seenBusinessKeys = new Set<string>();
  const lines: RoyaltyLine[] = [];

  const detailSchemas: Record<string, z.ZodTypeAny> = {
    [SHEET_VENTAS_COMBINADAS]: kdpVentasCombinadasRowSchema,
    [SHEET_EBOOKS]: kdpEbookRoyaltyRowSchema,
    [SHEET_IMPRESOS]: kdpImpresoRoyaltyRowSchema,
    [SHEET_TAPA_DURA]: kdpImpresoRoyaltyRowSchema,
  };

  for (const sheetKey of DETAIL_SHEETS) {
    const sheet = getSheet(sheetKey);
    if (!sheet) continue;
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const schema = detailSchemas[sheetKey];
    if (!schema) continue;
    rawRows.forEach((raw, index) => {
      const result = schema.safeParse(raw);
      if (!result.success) {
        issues.push({ sheet: sheetKey, row: index + 2, code: 'INVALID_ROW', severity: 'BLOCKING', message: result.error.issues.map((issue: z.ZodIssue) => issue.path.join('.')).join(', ') });
        return;
      }
      const row = result.data as Record<string, unknown>;
      const isbnOrAsin = String(row.ISBN ?? row['ASIN/ISBN'] ?? row.ASIN ?? '');
      const shaped: DetailRowShape = {
        'Fecha de las regalías': String(row['Fecha de las regalías']),
        Título: String(row.Título),
        'Nombre del autor': String(row['Nombre del autor']),
        Tienda: String(row.Tienda),
        'Tipo de transacción': String(row['Tipo de transacción']),
        'Unidades vendidas': Number(row['Unidades vendidas']),
        'Unidades devueltas': Number(row['Unidades devueltas']),
        'Unidades netas vendidas': Number(row['Unidades netas vendidas']),
        Regalías: Number(row.Regalías),
        Moneda: String(row.Moneda),
        isbnOrAsin,
        productionCost: Number(row['Gasto medio de entrega/producción'] ?? row['Gasto de producción medio'] ?? row['Gasto medio de envío'] ?? 0) || undefined,
      };
      const period = shaped['Fecha de las regalías'].slice(0, 7);
      const businessKey = buildBusinessKey(shaped, period);
      if (seenBusinessKeys.has(businessKey)) {
        issues.push({ sheet: sheetKey, row: index + 2, code: 'DUPLICATE_ACROSS_SHEETS', severity: 'INFO', message: `Fila ya contabilizada desde otra hoja (ISBN/ASIN ${isbnOrAsin}); se omite para evitar doble conteo` });
        return;
      }
      seenBusinessKeys.add(businessKey);
      const format = detectFormat(sheetKey, shaped['Tipo de transacción']);
      const classification: RoyaltyLineClassification = shaped['Unidades devueltas'] > 0 ? 'reembolso' : format;
      lines.push({
        businessKey,
        classification,
        status: 'RECOGNIZED',
        period,
        title: shaped.Título,
        isbnOrAsin,
        store: shaped.Tienda,
        unitsSold: shaped['Unidades vendidas'],
        unitsReturned: shaped['Unidades devueltas'],
        unitsNet: shaped['Unidades netas vendidas'],
        amount: shaped.Regalías,
        currency: shaped.Moneda,
        ...(shaped.productionCost !== undefined ? { productionCost: shaped.productionCost } : {}),
        sourceSheet: sheetKey,
      });
    });
  }

  // Pedidos procesados / Pedidos completados de eBooks: informational-only.
  // They duplicate unit counts already present in the royalty detail sheets,
  // so they are parsed for validation but never turned into RoyaltyLines.
  for (const sheetKey of [SHEET_PEDIDOS_PROCESADOS, SHEET_PEDIDOS_EBOOKS]) {
    const sheet = getSheet(sheetKey);
    if (!sheet) continue;
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    let validCount = 0;
    rawRows.forEach((raw, index) => {
      const result = kdpPedidosProcesadosRowSchema.safeParse(raw);
      if (!result.success) {
        issues.push({ sheet: sheetKey, row: index + 2, code: 'INVALID_ROW', severity: 'BLOCKING', message: result.error.issues.map((issue) => issue.path.join('.')).join(', ') });
        return;
      }
      validCount += 1;
    });
    if (validCount > 0) {
      issues.push({ sheet: sheetKey, code: 'INFORMATIONAL_ONLY_NOT_COUNTED', severity: 'INFO', message: `${validCount} fila(s) leídas; no generan RoyaltyLine para evitar doble conteo con las hojas de regalías` });
    }
  }

  // KENP leídas: always PENDING_TAX_REVIEW until a tenant configures tax treatment.
  const kenpSheet = getSheet(SHEET_KENP);
  if (kenpSheet) {
    const rawRows = XLSX.utils.sheet_to_json(kenpSheet, { defval: null });
    rawRows.forEach((raw, index) => {
      const result = kdpKenpRowSchema.safeParse(raw);
      if (!result.success) {
        issues.push({ sheet: SHEET_KENP, row: index + 2, code: 'INVALID_ROW', severity: 'BLOCKING', message: result.error.issues.map((issue) => issue.path.join('.')).join(', ') });
        return;
      }
      const row = result.data;
      const period = row.Fecha.slice(0, 7);
      const businessKey = createHash('sha256').update(['kenp', period, row.ASIN, row['Páginas KENP leídas']].join('|')).digest('hex');
      lines.push({
        businessKey,
        classification: 'kenp_lectura',
        status: 'PENDING_TAX_REVIEW',
        period,
        title: row.Título,
        isbnOrAsin: row.ASIN,
        store: row.Tienda,
        amount: 0,
        currency: 'EUR',
        kenpPages: row['Páginas KENP leídas'],
        sourceSheet: SHEET_KENP,
      });
      issues.push({ sheet: SHEET_KENP, row: index + 2, code: 'KENP_PENDING_REVIEW', severity: 'INFO', message: `Lectura KENP (${row['Páginas KENP leídas']} páginas) pendiente de revisión fiscal` });
    });
  }

  // Cross-validation against Resumen — consistency check only, never blocking.
  for (const [period, resumenValue] of resumenByPeriod) {
    const detailSum = lines
      .filter((line) => line.period === period && line.currency === 'EUR' && line.classification !== 'kenp_lectura')
      .reduce((sum, line) => sum + line.amount, 0);
    const tolerance = Math.max(0.01, Math.abs(resumenValue) * 0.01);
    if (Math.abs(detailSum - resumenValue) > tolerance) {
      issues.push({ sheet: SHEET_RESUMEN, code: 'SUMMARY_DETAIL_MISMATCH', severity: 'WARNING', message: `Resumen ${period}: ${resumenValue.toFixed(2)} EUR vs detalle ${detailSum.toFixed(2)} EUR` });
    }
  }

  const totalRoyalties = lines.filter((line) => line.classification !== 'kenp_lectura').reduce((sum, line) => sum + line.amount, 0);
  const periods = [...new Set(lines.map((line) => line.period))].sort();
  const statement: RoyaltyStatement = {
    hash: createHash('sha256').update(bytes).digest('hex'),
    sourceConnector: 'kdp',
    currency: 'EUR',
    periods,
    totalRoyalties: Math.round((totalRoyalties + Number.EPSILON) * 100) / 100,
    lineCount: lines.length,
  };

  return {
    hash: statement.hash,
    sheets: workbook.SheetNames,
    rows: lines,
    statement,
    issues,
  };
}
