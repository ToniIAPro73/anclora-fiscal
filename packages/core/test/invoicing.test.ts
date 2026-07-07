import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { InvoiceSequence, issueInvoice, rectifyInvoice, renderInvoicePdf } from '../src/invoicing';

describe('facturación inmutable', () => {
  it('emite factura y rectificativa enlazada con hashes distintos', async () => {
    const invoice = await issueInvoice(new InvoiceSequence('FS'), { operationId: 'op-1', customerLabel: 'Cliente demo', description: 'Ebook', taxBase: 6.72, taxRate: .04, taxAmount: .27, totalAmount: 6.99, currency: 'EUR', issuedAt: '2026-07-03' }, 'SIMPLIFICADA');
    const correction = await rectifyInvoice(new InvoiceSequence('AR-2026'), invoice, '2026-07-04');
    expect(invoice.number).toBe('FS-00001'); expect(invoice.sha256).toHaveLength(64);
    expect(invoice.type).toBe('SIMPLIFICADA');
    expect(correction).toMatchObject({ type: 'RECTIFICATIVA', originalDocumentId: invoice.id });
    expect(correction.input.totalAmount).toBe(-6.99); expect(correction.sha256).not.toBe(invoice.sha256);
    expect((await PDFDocument.load(invoice.pdfBytes)).getPageCount()).toBe(1);
  });

  it('no lanza cuando customerAddress/customerEmail están ausentes (comportamiento de omisión honesta)', async () => {
    const bytes = await renderInvoicePdf('F-00002', 'COMPLETA', { operationId: 'op-2', customerLabel: 'Cliente sin datos de contacto', description: 'Ebook', taxBase: 6.72, taxRate: .04, taxAmount: .27, totalAmount: 6.99, currency: 'EUR', issuedAt: '2026-07-03' });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('renderiza bytes distintos cuando customerAddress/customerEmail están presentes frente a ausentes', async () => {
    const base = { operationId: 'op-3', customerLabel: 'Cliente demo', description: 'Ebook', taxBase: 6.72, taxRate: .04, taxAmount: .27, totalAmount: 6.99, currency: 'EUR' as const, issuedAt: '2026-07-03' };
    const withoutContact = await renderInvoicePdf('F-00003', 'COMPLETA', base);
    const withContact = await renderInvoicePdf('F-00003', 'COMPLETA', { ...base, customerAddress: 'Calle Ejemplo 1, Palma', customerEmail: 'cliente@ejemplo.com' });
    expect(Buffer.from(withContact).equals(Buffer.from(withoutContact))).toBe(false);
  });
});
