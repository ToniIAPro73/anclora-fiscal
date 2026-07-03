import { createHash } from 'node:crypto';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';

export interface DossierInvoice { number: string; issuedAt: string; type: 'FULL_INVOICE' | 'RECTIFYING_INVOICE'; country: string; channel: string; taxBase: number; taxRate: number; taxAmount: number; totalAmount: number; currency: string; evidenceHash: string; }
export interface DossierIssue { code: string; severity: 'INFO' | 'WARNING' | 'HIGH' | 'BLOCKING'; status: 'OPEN' | 'RESOLVED'; }
export interface VatDossierInput { period: string; invoices: DossierInvoice[]; issues: DossierIssue[]; blockingApprovalId?: string; verifactuStatuses: Record<string, number>; }
export interface VatDossierResult { zipBytes: Uint8Array; manifest: Record<string, string>; status: 'CLOSED'; period: string; }

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
const csv = (rows: DossierInvoice[]) => ['number,issued_at,type,country,channel,tax_base,tax_rate,tax_amount,total_amount,currency,evidence_sha256', ...rows.map((row) => [row.number, row.issuedAt, row.type, row.country, row.channel, row.taxBase.toFixed(2), row.taxRate.toFixed(4), row.taxAmount.toFixed(2), row.totalAmount.toFixed(2), row.currency, row.evidenceHash].map(csvCell).join(','))].join('\n');

async function renderSummary(input: VatDossierInput): Promise<Uint8Array> {
  const document = await PDFDocument.create(); const page = document.addPage([595, 842]); const title = await document.embedFont(StandardFonts.TimesRomanBold); const body = await document.embedFont(StandardFonts.Helvetica);
  page.drawText('Expediente IVA', { x: 48, y: 770, size: 30, font: title, color: rgb(14 / 255, 27 / 255, 44 / 255) });
  page.drawText(`Periodo ${input.period}`, { x: 48, y: 735, size: 12, font: body });
  const base = input.invoices.reduce((sum, item) => sum + item.taxBase, 0); const tax = input.invoices.reduce((sum, item) => sum + item.taxAmount, 0);
  page.drawText(`Documentos: ${input.invoices.length}`, { x: 48, y: 680, size: 11, font: body }); page.drawText(`Base: ${base.toFixed(2)} EUR`, { x: 48, y: 655, size: 11, font: body }); page.drawText(`Cuota: ${tax.toFixed(2)} EUR`, { x: 48, y: 630, size: 11, font: body });
  page.drawText('Resumen de apoyo para asesoría. No genera ni presenta el modelo 303.', { x: 48, y: 80, size: 9, font: body, color: rgb(.35, .38, .42) });
  return document.save();
}

export async function createVatDossier(input: VatDossierInput): Promise<VatDossierResult> {
  if (input.issues.some((issue) => issue.severity === 'BLOCKING' && issue.status === 'OPEN') && !input.blockingApprovalId) throw new Error('BLOCKING_ISSUES_REQUIRE_APPROVAL');
  const csvBytes = strToU8(csv(input.invoices));
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(input.invoices), 'Facturas');
  const xlsxBytes = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
  const summaryBytes = await renderSummary(input);
  const files: Record<string, Uint8Array> = { 'facturas.csv': csvBytes, 'facturas.xlsx': xlsxBytes, 'resumen-iva.pdf': summaryBytes, 'estado-verifactu.json': strToU8(JSON.stringify(input.verifactuStatuses, null, 2)) };
  const manifest = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
  files['manifest.json'] = strToU8(JSON.stringify({ schemaVersion: 'anclora-vat-dossier-v1', period: input.period, files: manifest }, null, 2));
  return { zipBytes: zipSync(files, { level: 6 }), manifest, status: 'CLOSED', period: input.period };
}

export function verifyVatDossier(zipBytes: Uint8Array): boolean {
  const files = unzipSync(zipBytes); const manifestFile = files['manifest.json']; if (!manifestFile) return false;
  const parsed = JSON.parse(new TextDecoder().decode(manifestFile)) as { files: Record<string, string> };
  return Object.entries(parsed.files).every(([name, hash]) => files[name] && createHash('sha256').update(files[name]).digest('hex') === hash);
}
