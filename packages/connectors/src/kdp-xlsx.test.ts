import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseSpanishMonth, previewKdpXlsx, SHEET_EBOOKS, SHEET_IMPRESOS, SHEET_TAPA_DURA } from './kdp-xlsx';

const fixture = resolve(import.meta.dirname, '../test/fixtures/kdp-orders-anonymized.xlsx');

function buildRoyaltyWorkbookBytes(rows: {
  sheet: string;
  isbnOrAsin: string;
  unidadesDevueltas: number;
}[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const bySheet = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const list = bySheet.get(row.sheet) ?? [];
    list.push({
      'Fecha de las regalías': 'junio 2026',
      Título: 'Título de prueba',
      'Nombre del autor': 'Autora de prueba',
      ...(row.sheet === SHEET_EBOOKS ? { ASIN: row.isbnOrAsin } : { ISBN: row.isbnOrAsin, ASIN: row.isbnOrAsin, 'Fecha de pedido': 'junio 2026' }),
      Tienda: 'Amazon.es',
      'Tipo de regalía': '70%',
      'Tipo de transacción': row.sheet === SHEET_EBOOKS ? 'Venta estándar - eBook' : 'Venta estándar - Impreso',
      'Unidades vendidas': 4,
      'Unidades devueltas': row.unidadesDevueltas,
      'Unidades netas vendidas': 4 - row.unidadesDevueltas,
      'Precio de lista medio sin impuestos': 14.99,
      'Precio de oferta medio sin impuestos': 14.99,
      ...(row.sheet === SHEET_EBOOKS ? { 'Tamaño medio del archivo (MB)': 2, 'Gasto medio de envío': 0.1 } : { 'Gasto de producción medio': 2.05 }),
      Regalías: 10.5,
      Moneda: 'EUR',
    });
    bySheet.set(row.sheet, list);
  }
  for (const [sheetName, sheetRows] of bySheet) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetRows), sheetName);
  }
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Uint8Array(buffer);
}

describe('KDP XLSX connector', () => {
  it('lee las 9 hojas, incluida la de espacio final, sin lanzar', async () => {
    const preview = previewKdpXlsx(await readFile(fixture));
    expect(preview.sheets).toHaveLength(9);
    expect(preview.sheets).toContain(SHEET_TAPA_DURA + ' ');
  });

  it('nunca normaliza "Definiciones del informe" a operaciones', async () => {
    const preview = previewKdpXlsx(await readFile(fixture));
    expect(preview.rows.every((row) => row.sourceSheet !== 'Definiciones del informe')).toBe(true);
    expect(preview.issues.every((issue) => issue.sheet !== 'Definiciones del informe')).toBe(true);
  });

  it('clasifica la venta de 4 unidades / 27.76€ de Tapa blanda como impreso', async () => {
    const preview = previewKdpXlsx(await readFile(fixture));
    const sale = preview.rows.find((row) => row.isbnOrAsin === '9798184523026' && row.classification !== 'kenp_lectura');
    expect(sale).toBeDefined();
    expect(sale?.classification).toBe('impreso');
    expect(sale?.unitsNet).toBe(4);
    expect(sale?.amount).toBe(27.76);
  });

  it('captura el precio de oferta medio y el gasto de producción por línea', async () => {
    const preview = previewKdpXlsx(await readFile(fixture));
    const sale = preview.rows.find((row) => row.isbnOrAsin === '9798184523026' && row.classification !== 'kenp_lectura');
    expect(sale?.averageUnitPrice).toBe(14.99);
    expect(sale?.productionCost).toBe(2.05);
  });

  it('marca la fila KENP sintética como kenp_lectura / PENDING_TAX_REVIEW', async () => {
    const preview = previewKdpXlsx(await readFile(fixture));
    const kenp = preview.rows.find((row) => row.classification === 'kenp_lectura');
    expect(kenp).toBeDefined();
    expect(kenp?.status).toBe('PENDING_TAX_REVIEW');
    expect(kenp?.kenpPages).toBe(1234);
  });

  it('parseSpanishMonth convierte "junio 2026" a "2026-06"', () => {
    expect(parseSpanishMonth('junio 2026')).toBe('2026-06');
  });

  it('no genera SUMMARY_DETAIL_MISMATCH para el mes que concilia', async () => {
    const preview = previewKdpXlsx(await readFile(fixture));
    expect(preview.issues.filter((issue) => issue.code === 'SUMMARY_DETAIL_MISMATCH')).toHaveLength(0);
  });

  it('no duplica la venta ya contabilizada al leer Pedidos procesados', async () => {
    const preview = previewKdpXlsx(await readFile(fixture));
    const salesLines = preview.rows.filter((row) => row.isbnOrAsin === '9798184523026' && row.classification !== 'kenp_lectura');
    expect(salesLines).toHaveLength(1);
    expect(preview.issues.some((issue) => issue.code === 'INFORMATIONAL_ONLY_NOT_COUNTED' && issue.sheet === 'Pedidos procesados')).toBe(true);
    expect(preview.issues.some((issue) => issue.code === 'DUPLICATE_ACROSS_SHEETS')).toBe(true);
  });

  it('conserva el formato "ebook" en una línea con devoluciones aunque la clasificación pase a reembolso', () => {
    const bytes = buildRoyaltyWorkbookBytes([{ sheet: SHEET_EBOOKS, isbnOrAsin: 'ASIN-EBOOK-1', unidadesDevueltas: 1 }]);
    const preview = previewKdpXlsx(bytes);
    const line = preview.rows.find((row) => row.isbnOrAsin === 'ASIN-EBOOK-1');
    expect(line).toBeDefined();
    expect(line?.classification).toBe('reembolso');
    expect(line?.format).toBe('ebook');
    expect(line?.date).toBe('junio 2026');
  });

  it('conserva el formato "impreso" en una línea con devoluciones aunque la clasificación pase a reembolso', () => {
    const bytes = buildRoyaltyWorkbookBytes([{ sheet: SHEET_IMPRESOS, isbnOrAsin: 'ISBN-IMPRESO-1', unidadesDevueltas: 2 }]);
    const preview = previewKdpXlsx(bytes);
    const line = preview.rows.find((row) => row.isbnOrAsin === 'ISBN-IMPRESO-1');
    expect(line).toBeDefined();
    expect(line?.classification).toBe('reembolso');
    expect(line?.format).toBe('impreso');
  });

  it('asigna format a una línea sin devoluciones según la hoja de origen', () => {
    const bytes = buildRoyaltyWorkbookBytes([{ sheet: SHEET_EBOOKS, isbnOrAsin: 'ASIN-EBOOK-2', unidadesDevueltas: 0 }]);
    const preview = previewKdpXlsx(bytes);
    const line = preview.rows.find((row) => row.isbnOrAsin === 'ASIN-EBOOK-2');
    expect(line?.classification).toBe('ebook');
    expect(line?.format).toBe('ebook');
  });
});
