import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * customerAddress/customerEmail are optional, real buyer-contact evidence
 * captured from standard Shopify export columns (Phase 5b) — omitted from
 * the rendered "FACTURAR A" block when genuinely absent rather than
 * printing an empty line. No buyer tax ID (NIF/CIF) field exists here: a
 * Shopify order export does not carry one (not a standard export column;
 * would require a custom checkout field this connector has no way to
 * read). Spanish "factura simplificada" rules do not require buyer
 * NIF/full address for ordinary B2C retail sales, which matches this
 * connector's current B2C-only assumption — so invoices issued under that
 * assumption are very likely legally sufficient without a NIF. If the
 * tenant later sells B2B, intra-EU, or needs a "factura completa", NIF
 * capture becomes a real requirement and a different data source: a human
 * decision to make later, not silently worked around here.
 */
export interface InvoiceInput { operationId: string; customerLabel: string; customerAddress?: string; customerEmail?: string; description: string; taxBase: number; taxRate: number; taxAmount: number; totalAmount: number; currency: 'EUR'; issuedAt: string; }
export interface FiscalDocument { readonly id: string; readonly number: string; readonly type: 'FULL_INVOICE' | 'RECTIFYING_INVOICE'; readonly originalDocumentId?: string; readonly input: Readonly<InvoiceInput>; readonly pdfBytes: Uint8Array; readonly sha256: string; readonly status: 'ISSUED'; }

export class InvoiceSequence {
  private next: number;
  constructor(private readonly prefix: string, initial = 1) { this.next = initial; }
  allocate(): string { const value = `${this.prefix}-${String(this.next).padStart(5, '0')}`; this.next += 1; return value; }
}

const euro = (value: number) => `${value.toFixed(2)} EUR`;

export async function renderInvoicePdf(number: string, type: FiscalDocument['type'], input: InvoiceInput, originalNumber?: string): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`${type === 'RECTIFYING_INVOICE' ? 'Factura rectificativa' : 'Factura'} ${number}`);
  document.setProducer('Anclora Fiscal · pdf-lib');
  const page = document.addPage([595.28, 841.89]);
  const display = await document.embedFont(StandardFonts.TimesRoman);
  const displayBold = await document.embedFont(StandardFonts.TimesRomanBold);
  const ui = await document.embedFont(StandardFonts.Helvetica);
  const midnight = rgb(14 / 255, 27 / 255, 44 / 255); const gold = rgb(199 / 255, 150 / 255, 76 / 255); const ivory = rgb(245 / 255, 240 / 255, 230 / 255);
  page.drawRectangle({ x: 0, y: 700, width: 595.28, height: 141.89, color: midnight });
  page.drawText('A N C L O R A   F I S C A L', { x: 48, y: 785, size: 9, font: ui, color: gold });
  page.drawText(type === 'RECTIFYING_INVOICE' ? 'Factura rectificativa' : 'Factura', { x: 48, y: 735, size: 30, font: displayBold, color: ivory });
  page.drawText(number, { x: 420, y: 742, size: 13, font: ui, color: ivory });
  page.drawLine({ start: { x: 48, y: 678 }, end: { x: 547, y: 678 }, thickness: 1, color: gold });
  page.drawText('Emitida por Anclora Insights', { x: 48, y: 645, size: 11, font: ui, color: midnight });
  page.drawText(`Fecha: ${input.issuedAt}`, { x: 390, y: 645, size: 10, font: ui, color: midnight });
  page.drawText('FACTURAR A', { x: 48, y: 590, size: 8, font: ui, color: gold });
  page.drawText(input.customerLabel, { x: 48, y: 568, size: 13, font: display, color: midnight });
  let buyerBlockY = 550;
  if (input.customerAddress) { page.drawText(input.customerAddress, { x: 48, y: buyerBlockY, size: 10, font: ui, color: midnight }); buyerBlockY -= 15; }
  if (input.customerEmail) { page.drawText(input.customerEmail, { x: 48, y: buyerBlockY, size: 10, font: ui, color: midnight }); buyerBlockY -= 15; }
  if (originalNumber) page.drawText(`Rectifica el documento ${originalNumber}`, { x: 48, y: buyerBlockY, size: 10, font: ui, color: midnight });
  page.drawRectangle({ x: 48, y: 430, width: 499, height: 54, color: midnight });
  page.drawText('CONCEPTO', { x: 62, y: 452, size: 8, font: ui, color: ivory });
  page.drawText('BASE', { x: 330, y: 452, size: 8, font: ui, color: ivory }); page.drawText('IVA', { x: 415, y: 452, size: 8, font: ui, color: ivory }); page.drawText('TOTAL', { x: 478, y: 452, size: 8, font: ui, color: ivory });
  page.drawText(input.description, { x: 62, y: 400, size: 11, font: display, color: midnight });
  page.drawText(euro(input.taxBase), { x: 330, y: 400, size: 9, font: ui, color: midnight }); page.drawText(`${(input.taxRate * 100).toFixed(0)} %`, { x: 415, y: 400, size: 9, font: ui, color: midnight }); page.drawText(euro(input.totalAmount), { x: 478, y: 400, size: 9, font: ui, color: midnight });
  page.drawLine({ start: { x: 330, y: 355 }, end: { x: 547, y: 355 }, thickness: .8, color: gold });
  page.drawText('Base imponible', { x: 330, y: 330, size: 9, font: ui, color: midnight }); page.drawText(euro(input.taxBase), { x: 478, y: 330, size: 9, font: ui, color: midnight });
  page.drawText('Cuota IVA', { x: 330, y: 307, size: 9, font: ui, color: midnight }); page.drawText(euro(input.taxAmount), { x: 478, y: 307, size: 9, font: ui, color: midnight });
  page.drawText('TOTAL', { x: 330, y: 270, size: 13, font: displayBold, color: midnight }); page.drawText(euro(input.totalAmount), { x: 465, y: 270, size: 13, font: displayBold, color: gold });
  page.drawText('Documento generado con trazabilidad de operación y regla fiscal versionada.', { x: 48, y: 65, size: 8, font: ui, color: rgb(.35, .38, .42) });
  return document.save();
}

export async function issueInvoice(sequence: InvoiceSequence, input: InvoiceInput): Promise<FiscalDocument> {
  const number = sequence.allocate(); const pdfBytes = await renderInvoicePdf(number, 'FULL_INVOICE', input);
  return Object.freeze({ id: randomUUID(), number, type: 'FULL_INVOICE', input: Object.freeze({ ...input }), pdfBytes, sha256: createHash('sha256').update(pdfBytes).digest('hex'), status: 'ISSUED' });
}

export async function rectifyInvoice(sequence: InvoiceSequence, original: FiscalDocument, issuedAt: string): Promise<FiscalDocument> {
  if (original.status !== 'ISSUED') throw new Error('Solo puede rectificarse un documento emitido');
  const input = { ...original.input, taxBase: -original.input.taxBase, taxAmount: -original.input.taxAmount, totalAmount: -original.input.totalAmount, issuedAt };
  const number = sequence.allocate(); const pdfBytes = await renderInvoicePdf(number, 'RECTIFYING_INVOICE', input, original.number);
  return Object.freeze({ id: randomUUID(), number, type: 'RECTIFYING_INVOICE', originalDocumentId: original.id, input: Object.freeze(input), pdfBytes, sha256: createHash('sha256').update(pdfBytes).digest('hex'), status: 'ISSUED' });
}
