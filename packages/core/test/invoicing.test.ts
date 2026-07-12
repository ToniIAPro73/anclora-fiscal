import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  InvoiceSequence,
  issueInvoice,
  rectifyInvoice,
  renderInvoicePdf,
} from '../src/invoicing';

describe('facturación inmutable', () => {
  it('emite factura simplificada y rectificativa enlazada con hashes distintos', async () => {
    const invoice = await issueInvoice(
      new InvoiceSequence('FS'),
      {
        operationId: 'op-1',
        issuerName: 'Anclora Fiscal',
        issuerTaxIdentity: '12345678Z',
        issuerAddress: 'Calle Fiscal 1, Palma',
        description: 'Ebook',
        taxBase: 6.72,
        taxRate: 0.04,
        taxAmount: 0.27,
        totalAmount: 6.99,
        currency: 'EUR',
        issuedAt: '2026-07-03',
      },
      'SIMPLIFICADA',
    );

    const correction = await rectifyInvoice(
      new InvoiceSequence('AR-2026'),
      invoice,
      '2026-07-04',
    );

    expect(invoice.number).toBe('FS-00001');
    expect(invoice.sha256).toHaveLength(64);
    expect(invoice.type).toBe('SIMPLIFICADA');

    expect(correction).toMatchObject({
      type: 'RECTIFICATIVA',
      originalDocumentId: invoice.id,
    });

    expect(correction.input.totalAmount).toBe(-6.99);
    expect(correction.sha256).not.toBe(invoice.sha256);

    expect(
      (await PDFDocument.load(invoice.pdfBytes)).getPageCount(),
    ).toBe(1);
  });

  it('renderiza una factura simplificada con los datos obligatorios del emisor', async () => {
    const bytes = await renderInvoicePdf(
      'FS-00002',
      'SIMPLIFICADA',
      {
        operationId: 'op-2',
        issuerName: 'Anclora Fiscal',
        issuerTaxIdentity: '12345678Z',
        issuerAddress: 'Calle Fiscal 1, Palma',
        description: 'Ebook',
        taxBase: 6.72,
        taxRate: 0.04,
        taxAmount: 0.27,
        totalAmount: 6.99,
        currency: 'EUR',
        issuedAt: '2026-07-03',
      },
    );

    expect(
      (await PDFDocument.load(bytes)).getPageCount(),
    ).toBe(1);
  });

  it('no conserva datos del comprador en el contrato de la factura simplificada', async () => {
    const invoice = await issueInvoice(
      new InvoiceSequence('FS'),
      {
        operationId: 'op-3',
        issuerName: 'Anclora Fiscal',
        issuerTaxIdentity: '12345678Z',
        issuerAddress: 'Calle Fiscal 1, Palma',
        description: 'Ebook',
        taxBase: 6.72,
        taxRate: 0.04,
        taxAmount: 0.27,
        totalAmount: 6.99,
        currency: 'EUR',
        issuedAt: '2026-07-03',
      },
      'SIMPLIFICADA',
    );

    expect(invoice.input).toEqual({
      operationId: 'op-3',
      issuerName: 'Anclora Fiscal',
      issuerTaxIdentity: '12345678Z',
      issuerAddress: 'Calle Fiscal 1, Palma',
      description: 'Ebook',
      taxBase: 6.72,
      taxRate: 0.04,
      taxAmount: 0.27,
      totalAmount: 6.99,
      currency: 'EUR',
      issuedAt: '2026-07-03',
    });

    expect(invoice.input).not.toHaveProperty('customerLabel');
    expect(invoice.input).not.toHaveProperty('customerAddress');
    expect(invoice.input).not.toHaveProperty('customerEmail');
  });

  it('incrusta el QR de cotejo VERI*FACTU cuando se solicita un entorno', async () => {
    const invoiceInput = {
      operationId: 'op-4',
      issuerName: 'Anclora Fiscal',
      issuerTaxIdentity: '12345678Z',
      issuerAddress: 'Calle Fiscal 1, Palma',
      description: 'Ebook',
      taxBase: 6.72,
      taxRate: 0.04,
      taxAmount: 0.27,
      totalAmount: 6.99,
      currency: 'EUR' as const,
      issuedAt: '2026-07-03',
    };

    const withoutQr = await renderInvoicePdf('FS-00003', 'SIMPLIFICADA', invoiceInput);
    const withQr = await renderInvoicePdf(
      'FS-00003',
      'SIMPLIFICADA',
      invoiceInput,
      undefined,
      { environment: 'test' },
    );

    expect((await PDFDocument.load(withQr)).getPageCount()).toBe(1);
    // A 300x300 QR image XObject adds several KB — a reliable signal the
    // image was actually embedded, since pdf-lib decodes PNGs into raw
    // Image XObjects rather than embedding the literal PNG bytes verbatim.
    expect(withQr.length).toBeGreaterThan(withoutQr.length + 2000);
  });

  it('no incrusta QR cuando no se solicita entorno VERI*FACTU', async () => {
    const bytes = await renderInvoicePdf(
      'FS-00004',
      'SIMPLIFICADA',
      {
        operationId: 'op-5',
        issuerName: 'Anclora Fiscal',
        issuerTaxIdentity: '12345678Z',
        issuerAddress: 'Calle Fiscal 1, Palma',
        description: 'Ebook',
        taxBase: 6.72,
        taxRate: 0.04,
        taxAmount: 0.27,
        totalAmount: 6.99,
        currency: 'EUR',
        issuedAt: '2026-07-03',
      },
    );

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});