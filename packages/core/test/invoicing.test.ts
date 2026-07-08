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
});