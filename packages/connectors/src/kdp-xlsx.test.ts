import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpanishMonth, previewKdpXlsx, SHEET_TAPA_DURA } from './kdp-xlsx';

const fixture = resolve(import.meta.dirname, '../test/fixtures/kdp-orders-anonymized.xlsx');

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
});
