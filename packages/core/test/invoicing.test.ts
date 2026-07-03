import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { InvoiceSequence, issueInvoice, rectifyInvoice } from '../src/invoicing';

describe('facturación inmutable', () => {
  it('emite factura y rectificativa enlazada con hashes distintos', async () => {
    const invoice = await issueInvoice(new InvoiceSequence('AF-2026'), { operationId: 'op-1', customerLabel: 'Cliente demo', description: 'Ebook', taxBase: 6.72, taxRate: .04, taxAmount: .27, totalAmount: 6.99, currency: 'EUR', issuedAt: '2026-07-03' });
    const correction = await rectifyInvoice(new InvoiceSequence('AR-2026'), invoice, '2026-07-04');
    expect(invoice.number).toBe('AF-2026-00001'); expect(invoice.sha256).toHaveLength(64);
    expect(correction).toMatchObject({ type: 'RECTIFYING_INVOICE', originalDocumentId: invoice.id });
    expect(correction.input.totalAmount).toBe(-6.99); expect(correction.sha256).not.toBe(invoice.sha256);
    expect((await PDFDocument.load(invoice.pdfBytes)).getPageCount()).toBe(1);
  });
});
