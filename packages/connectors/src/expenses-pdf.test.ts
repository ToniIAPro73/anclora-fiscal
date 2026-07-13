import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { isExpensesPdfFile, previewExpensesPdf } from './expenses-pdf';

async function buildInvoicePdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 560;
  for (const line of lines) {
    page.drawText(line, { x: 40, y, size: 12, font });
    y -= 20;
  }
  return doc.save();
}

describe('expenses PDF', () => {
  it('detecta el encabezado %PDF- y rechaza bytes que no lo son', async () => {
    const bytes = await buildInvoicePdf(['Proveedor SL']);
    expect(isExpensesPdfFile(bytes)).toBe(true);
    expect(isExpensesPdfFile(new TextEncoder().encode('document type,issue date'))).toBe(false);
  });

  it('extrae los campos de una factura PDF con heurísticas de texto', async () => {
    const bytes = await buildInvoicePdf([
      'Proveedor SL',
      'NIF: B12345678',
      'Factura Nº: F-001',
      'Fecha: 15/01/2026',
      'Base imponible: 100,00',
      'IVA 21%: 21,00',
      'Total: 121,00',
    ]);
    const preview = await previewExpensesPdf(bytes);
    expect(preview.connector).toBe('expenses-pdf');
    expect(preview.documents).toHaveLength(1);
    const document = preview.documents[0]!;
    expect(document.supplierTaxId).toBe('B12345678');
    expect(document.invoiceNumber).toBe('F-001');
    expect(document.issueDate).toBe('2026-01-15');
    expect(document.taxBase).toBe(100);
    expect(document.vatAmount).toBe(21);
    expect(document.total).toBe(121);
    expect(document.vatRate).toBe(21);
    expect(document.supplierName).toBe('Proveedor SL');
    // category is never guessed -- the reviewer must pick one before confirming.
    expect(preview.issues.map((issue) => issue.code)).toContain('EXPENSE_CATEGORY_UNKNOWN');
    expect(preview.issues.map((issue) => issue.code)).not.toContain('EXPENSE_NUMBER_MISSING');
    expect(preview.issues.map((issue) => issue.code)).not.toContain('EXPENSE_DATE_INVALID');
    expect(preview.issues.map((issue) => issue.code)).not.toContain('EXPENSE_TOTAL_INCOHERENT');
  });

  it('no lanza con bytes de PDF ilegibles y produce incidencias en su lugar', async () => {
    const garbage = new TextEncoder().encode('%PDF-1.4\nnot a real pdf body');
    const preview = await previewExpensesPdf(garbage);
    expect(preview.documents).toHaveLength(1);
    expect(preview.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['EXPENSE_NUMBER_MISSING', 'EXPENSE_DATE_INVALID', 'EXPENSE_CATEGORY_UNKNOWN']),
    );
  });
});
