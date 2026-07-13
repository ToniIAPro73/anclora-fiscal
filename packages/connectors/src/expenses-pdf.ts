import { extractText, getDocumentProxy } from 'unpdf';

// unpdf (not pdf-parse): pdf-parse's index.js runs a debug branch on import
// that reads a hardcoded test fixture path and throws ENOENT in some
// environments (well-known footgun). unpdf is ESM-native, ships pdf.js under
// the hood, and needs zero Node worker configuration.

export interface ExpenseDocument {
  documentType: string;
  issueDate: string;
  invoiceNumber: string;
  supplierTaxId: string;
  supplierName: string;
  country: string;
  currency: string;
  taxBase: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  withholding: number;
  category: string;
  description: string;
  paidDate?: string;
  evidenceFilename?: string;
}

export interface ExpenseIssue { row: number; code: string; blocking: boolean; message: string }

export function isExpensesPdfFile(bytes: Uint8Array): boolean {
  return new TextDecoder('latin1').decode(bytes.slice(0, 8)).startsWith('%PDF-');
}

// CIF: letter + 7 digits + digit/letter; NIF: 8 digits + letter.
const TAX_ID_PATTERN = /\b(?:[A-HJ-NP-SUVW]\d{7}[0-9A-J]|\d{8}[A-Z])\b/i;
const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DMY_DATE_PATTERN = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/;
const INVOICE_NUMBER_PATTERN = /(?:factura|fra\.?|n[º°o]\.?|n[uú]mero|invoice)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/]{2,20})/i;

function isValidDateParts(day: number, month: number): boolean {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

function findIssueDate(text: string): string {
  const isoMatch = text.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    if (year && month && day && isValidDateParts(Number(day), Number(month))) return `${year}-${month}-${day}`;
  }
  const dmyMatch = text.match(DMY_DATE_PATTERN);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    if (day && month && year && isValidDateParts(Number(day), Number(month))) return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return '';
}

// Spanish number format uses '.' as thousands separator and ',' as decimal
// separator (e.g. "1.234,56"). Strip thousands dots, then normalize the
// decimal comma to a dot before parsing.
function parseSpanishAmount(raw: string): number {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

function findAmountNear(text: string, keyword: RegExp): number {
  const match = text.match(new RegExp(`${keyword.source}[^\\d]{0,20}(\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})?)`, 'i'));
  return match?.[1] ? parseSpanishAmount(match[1]) : NaN;
}

function findVatRate(text: string): number {
  const match = text.match(/\b(21|10|4|0)\s*%/);
  return match?.[1] ? Number(match[1]) : NaN;
}

// unpdf joins positioned text items with spaces, not newlines, so a real
// extracted invoice is usually one long blob rather than discrete lines.
// Best-effort: the supplier name is whatever text precedes the first
// recognizable invoice label (NIF/CIF, Factura, Fecha, Total, IVA...).
const FIRST_LABEL_PATTERN = /\b(?:NIF|CIF|Factura|Fra\.?|Fecha|Total|Base imponible|IVA|Invoice|N[º°o]\.?)\b/i;

function findSupplierName(text: string): string {
  const labelMatch = text.match(FIRST_LABEL_PATTERN);
  const candidate = (labelMatch?.index !== undefined ? text.slice(0, labelMatch.index) : text).trim();
  return /^\d/.test(candidate) ? '' : candidate;
}

/**
 * A PDF invoice always yields exactly one document. Extraction is
 * best-effort text-heuristics only (no OCR/AI) -- if parsing fails or the
 * PDF has no extractable text, this returns a blank document and lets the
 * existing missing-field issue codes fire so the reviewer catches it,
 * rather than inventing a new issue code for this edge case.
 */
export async function previewExpensesPdf(bytes: Uint8Array): Promise<{ connector: 'expenses-pdf'; documents: ExpenseDocument[]; issues: ExpenseIssue[] }> {
  let text = '';
  try {
    const proxy = await getDocumentProxy(bytes);
    const result = await extractText(proxy, { mergePages: true });
    text = result.text;
  } catch {
    text = '';
  }

  const taxIdMatch = text.match(TAX_ID_PATTERN);
  const supplierTaxId = taxIdMatch ? taxIdMatch[0].toUpperCase() : '';
  const issueDate = findIssueDate(text);
  const invoiceNumberMatch = text.match(INVOICE_NUMBER_PATTERN);
  const invoiceNumber = invoiceNumberMatch?.[1] ?? '';

  let total = findAmountNear(text, /total/);
  let taxBase = findAmountNear(text, /base imponible/);
  let vatAmount = findAmountNear(text, /iva/);
  const vatRate = findVatRate(text);

  // Derive the missing amount when exactly two of the three are known.
  const knownCount = [total, taxBase, vatAmount].filter((value) => !Number.isNaN(value)).length;
  if (knownCount === 2) {
    if (Number.isNaN(vatAmount)) vatAmount = Math.round((total - taxBase) * 100) / 100;
    else if (Number.isNaN(taxBase)) taxBase = Math.round((total - vatAmount) * 100) / 100;
    else if (Number.isNaN(total)) total = Math.round((taxBase + vatAmount) * 100) / 100;
  }

  const document: ExpenseDocument = {
    documentType: 'COMPRA',
    issueDate,
    invoiceNumber,
    supplierTaxId,
    supplierName: findSupplierName(text),
    country: 'ES',
    currency: 'EUR',
    taxBase: Number.isNaN(taxBase) ? 0 : taxBase,
    vatRate: Number.isNaN(vatRate) ? 0 : vatRate,
    vatAmount: Number.isNaN(vatAmount) ? 0 : vatAmount,
    total: Number.isNaN(total) ? 0 : total,
    withholding: 0,
    category: '',
    description: '',
  };

  const issues: ExpenseIssue[] = [];
  if (!document.invoiceNumber) issues.push({ row: 1, code: 'EXPENSE_NUMBER_MISSING', blocking: true, message: 'Número de factura vacío' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document.issueDate)) issues.push({ row: 1, code: 'EXPENSE_DATE_INVALID', blocking: true, message: 'Fecha inválida' });
  if (!Number.isNaN(taxBase) && !Number.isNaN(total) && Math.abs(document.taxBase + document.vatAmount - document.withholding - document.total) > 0.01) {
    issues.push({ row: 1, code: 'EXPENSE_TOTAL_INCOHERENT', blocking: true, message: 'Total incoherente' });
  }
  if (!document.category) issues.push({ row: 1, code: 'EXPENSE_CATEGORY_UNKNOWN', blocking: true, message: 'Categoría desconocida' });

  return { connector: 'expenses-pdf', documents: [document], issues };
}
