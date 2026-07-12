import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  buildVerifactuQrValidationUrl,
  generateVerifactuQrPng,
  VERIFACTU_QR_LEGEND_LINES,
  type VerifactuQrEnvironment,
} from './verifactu-qr.js';

export type FiscalDocumentType =
  | 'SIMPLIFICADA'
  | 'COMPLETA'
  | 'RECTIFICATIVA'
  | 'FULL_INVOICE'
  | 'RECTIFYING_INVOICE';

export interface InvoiceInput {
  operationId: string;
  issuerName: string;
  issuerTaxIdentity: string;
  issuerAddress: string;
  description: string;
  taxBase: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: 'EUR';
  issuedAt: string;
}

export interface FiscalDocument {
  readonly id: string;
  readonly number: string;
  readonly type: FiscalDocumentType;
  readonly originalDocumentId?: string;
  readonly input: Readonly<InvoiceInput>;
  readonly pdfBytes: Uint8Array;
  readonly sha256: string;
  readonly status: 'ISSUED';
}

export class InvoiceSequence {
  private next: number;

  constructor(
    private readonly prefix: string,
    initial = 1,
  ) {
    this.next = initial;
  }

  allocate(): string {
    const value = `${this.prefix}-${String(this.next).padStart(5, '0')}`;

    this.next += 1;

    return value;
  }
}

const euro = (value: number) => `${value.toFixed(2)} EUR`;

const documentTitle = (type: FiscalDocumentType) => {
  if (
    type === 'RECTIFICATIVA'
    || type === 'RECTIFYING_INVOICE'
  ) {
    return 'Factura rectificativa';
  }

  if (type === 'SIMPLIFICADA') {
    return 'Factura simplificada';
  }

  return 'Factura completa';
};

export interface RenderInvoicePdfQrOptions {
  environment: VerifactuQrEnvironment;
}

export async function renderInvoicePdf(
  number: string,
  type: FiscalDocument['type'],
  input: InvoiceInput,
  originalNumber?: string,
  qr?: RenderInvoicePdfQrOptions,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();

  document.setTitle(`${documentTitle(type)} ${number}`);
  document.setProducer('Anclora Fiscal · pdf-lib');

  const page = document.addPage([595.28, 841.89]);

  const display = await document.embedFont(
    StandardFonts.TimesRoman,
  );

  const displayBold = await document.embedFont(
    StandardFonts.TimesRomanBold,
  );

  const ui = await document.embedFont(
    StandardFonts.Helvetica,
  );

  const midnight = rgb(14 / 255, 27 / 255, 44 / 255);
  const gold = rgb(199 / 255, 150 / 255, 76 / 255);
  const ivory = rgb(245 / 255, 240 / 255, 230 / 255);
  const muted = rgb(0.35, 0.38, 0.42);

  page.drawRectangle({
    x: 0,
    y: 700,
    width: 595.28,
    height: 141.89,
    color: midnight,
  });

  page.drawText('A N C L O R A   F I S C A L', {
    x: 48,
    y: 785,
    size: 9,
    font: ui,
    color: gold,
  });

  page.drawText(documentTitle(type), {
    x: 48,
    y: 735,
    size: 30,
    font: displayBold,
    color: ivory,
  });

  page.drawText(number, {
    x: 420,
    y: 742,
    size: 13,
    font: ui,
    color: ivory,
  });

  page.drawLine({
    start: { x: 48, y: 678 },
    end: { x: 547, y: 678 },
    thickness: 1,
    color: gold,
  });

  page.drawText('EMISOR', {
    x: 48,
    y: 645,
    size: 8,
    font: ui,
    color: gold,
  });

  page.drawText(input.issuerName, {
    x: 48,
    y: 622,
    size: 13,
    font: display,
    color: midnight,
  });

  page.drawText(`NIF/NIE: ${input.issuerTaxIdentity}`, {
    x: 48,
    y: 603,
    size: 10,
    font: ui,
    color: midnight,
  });

  page.drawText(input.issuerAddress, {
    x: 48,
    y: 585,
    size: 10,
    font: ui,
    color: midnight,
  });

  page.drawText(`Fecha: ${input.issuedAt}`, {
    x: 390,
    y: 645,
    size: 10,
    font: ui,
    color: midnight,
  });

  if (originalNumber) {
    page.drawText(
      `Rectifica el documento ${originalNumber}`,
      {
        x: 48,
        y: 555,
        size: 10,
        font: ui,
        color: midnight,
      },
    );
  }

  page.drawRectangle({
    x: 48,
    y: 430,
    width: 499,
    height: 54,
    color: midnight,
  });

  page.drawText('CONCEPTO', {
    x: 62,
    y: 452,
    size: 8,
    font: ui,
    color: ivory,
  });

  page.drawText('BASE', {
    x: 330,
    y: 452,
    size: 8,
    font: ui,
    color: ivory,
  });

  page.drawText('IVA', {
    x: 415,
    y: 452,
    size: 8,
    font: ui,
    color: ivory,
  });

  page.drawText('TOTAL', {
    x: 478,
    y: 452,
    size: 8,
    font: ui,
    color: ivory,
  });

  page.drawText(input.description, {
    x: 62,
    y: 400,
    size: 11,
    font: display,
    color: midnight,
  });

  page.drawText(euro(input.taxBase), {
    x: 330,
    y: 400,
    size: 9,
    font: ui,
    color: midnight,
  });

  page.drawText(`${(input.taxRate * 100).toFixed(0)} %`, {
    x: 415,
    y: 400,
    size: 9,
    font: ui,
    color: midnight,
  });

  page.drawText(euro(input.totalAmount), {
    x: 478,
    y: 400,
    size: 9,
    font: ui,
    color: midnight,
  });

  page.drawLine({
    start: { x: 330, y: 355 },
    end: { x: 547, y: 355 },
    thickness: 0.8,
    color: gold,
  });

  page.drawText('Base imponible', {
    x: 330,
    y: 330,
    size: 9,
    font: ui,
    color: midnight,
  });

  page.drawText(euro(input.taxBase), {
    x: 478,
    y: 330,
    size: 9,
    font: ui,
    color: midnight,
  });

  page.drawText('Cuota IVA', {
    x: 330,
    y: 307,
    size: 9,
    font: ui,
    color: midnight,
  });

  page.drawText(euro(input.taxAmount), {
    x: 478,
    y: 307,
    size: 9,
    font: ui,
    color: midnight,
  });

  page.drawText('TOTAL', {
    x: 330,
    y: 270,
    size: 13,
    font: displayBold,
    color: midnight,
  });

  page.drawText(euro(input.totalAmount), {
    x: 465,
    y: 270,
    size: 13,
    font: displayBold,
    color: gold,
  });

  page.drawText(
    'Documento generado con trazabilidad de operación y regla fiscal versionada.',
    {
      x: 48,
      y: 65,
      size: 8,
      font: ui,
      color: muted,
    },
  );

  if (qr) {
    const { url } = buildVerifactuQrValidationUrl({
      environment: qr.environment,
      issuerTaxIdentity: input.issuerTaxIdentity,
      documentNumber: number,
      issuedAt: input.issuedAt,
      totalAmount: input.totalAmount,
    });

    const qrPng = await generateVerifactuQrPng(url);
    const qrImage = await document.embedPng(qrPng);

    const qrSize = 100; // ≈ 35.3 mm, within the 30–40 mm AEAT-recommended range
    const qrX = 547 - qrSize;
    const qrY = 78;

    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
    });

    VERIFACTU_QR_LEGEND_LINES.forEach((line, index) => {
      const textWidth = ui.widthOfTextAtSize(line, 6);

      page.drawText(line, {
        x: qrX + (qrSize - textWidth) / 2,
        y: qrY - 10 - index * 9,
        size: 6,
        font: ui,
        color: muted,
      });
    });
  }

  return document.save();
}

export async function issueInvoice(
  sequence: InvoiceSequence,
  input: InvoiceInput,
  type: FiscalDocumentType = 'COMPLETA',
  qrEnvironment?: VerifactuQrEnvironment,
): Promise<FiscalDocument> {
  const number = sequence.allocate();

  const pdfBytes = await renderInvoicePdf(
    number,
    type,
    input,
    undefined,
    qrEnvironment ? { environment: qrEnvironment } : undefined,
  );

  return Object.freeze({
    id: randomUUID(),
    number,
    type,
    input: Object.freeze({ ...input }),
    pdfBytes,
    sha256: createHash('sha256')
      .update(pdfBytes)
      .digest('hex'),
    status: 'ISSUED',
  });
}

export async function rectifyInvoice(
  sequence: InvoiceSequence,
  original: FiscalDocument,
  issuedAt: string,
  qrEnvironment?: VerifactuQrEnvironment,
): Promise<FiscalDocument> {
  if (original.status !== 'ISSUED') {
    throw new Error(
      'Solo puede rectificarse un documento emitido',
    );
  }

  const input: InvoiceInput = {
    ...original.input,
    taxBase: -original.input.taxBase,
    taxAmount: -original.input.taxAmount,
    totalAmount: -original.input.totalAmount,
    issuedAt,
  };

  const number = sequence.allocate();

  const pdfBytes = await renderInvoicePdf(
    number,
    'RECTIFICATIVA',
    input,
    original.number,
    qrEnvironment ? { environment: qrEnvironment } : undefined,
  );

  return Object.freeze({
    id: randomUUID(),
    number,
    type: 'RECTIFICATIVA',
    originalDocumentId: original.id,
    input: Object.freeze(input),
    pdfBytes,
    sha256: createHash('sha256')
      .update(pdfBytes)
      .digest('hex'),
    status: 'ISSUED',
  });
}