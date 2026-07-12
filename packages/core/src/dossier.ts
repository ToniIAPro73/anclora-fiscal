import { createHash } from "node:crypto";
import { strToU8, unzipSync, zipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";

export interface DossierInvoice {
  number: string;
  issuedAt: string;
  type: "FULL_INVOICE" | "RECTIFYING_INVOICE";
  country: string;
  channel: string;
  taxBase: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  evidenceHash: string;
}

export interface DossierIssue {
  code: string;
  severity: "INFO" | "WARNING" | "HIGH" | "BLOCKING";
  status: "OPEN" | "RESOLVED";
}

export interface DossierVerifactuRecord {
  invoiceNumber: string;
  documentType: string;
  issuedAt: string;
  environment: string;
  status: string;
  recordType: string;
  attemptCount: number;
  chainHash: string;
  previousHash: string | null;
  responseReference: string | null;
  responseStatus: string | null;
  submittedAt: string | null;
}

export interface DossierVerifactuState {
  schemaVersion: "anclora-verifactu-state-v1";
  period: string;
  summary: Record<string, number>;
  records: DossierVerifactuRecord[];
}

export interface DossierRoyaltySummary {
  format: string;
  unitsNet: number;
  amount: number;
  currency: string;
}

export interface DossierWarning {
  type: "OSS" | "B2B" | "REFUND";
  orderId: string;
  detail: string;
}
export interface DossierPurchase { documentNumber:string; issueDate:string; category:string; currency:string; taxBase:number; vatAmount:number; totalAmount:number; withholdingAmount:number; decisionStatus:string; deductibleIrpf:number; deductibleVat:number; ruleVersion:string; explanation:string }

export interface VatDossierInput {
  period: string;
  invoices: DossierInvoice[];
  issues: DossierIssue[];
  blockingApprovalId?: string;
  verifactuStatuses: Record<string, number>;
  verifactuRecords?: DossierVerifactuRecord[];
  royaltiesByFormat?: DossierRoyaltySummary[];
  warnings?: DossierWarning[];
  purchases?: DossierPurchase[];
}

export interface VatDossierResult {
  zipBytes: Uint8Array;
  manifest: Record<string, string>;
  status: "CLOSED";
  period: string;
}

const csvCell = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

const csv = (rows: DossierInvoice[]) =>
  [
    "number,issued_at,type,country,channel,tax_base,tax_rate,tax_amount,total_amount,currency,evidence_sha256",
    ...rows.map((row) =>
      [
        row.number,
        row.issuedAt,
        row.type,
        row.country,
        row.channel,
        row.taxBase.toFixed(2),
        row.taxRate.toFixed(4),
        row.taxAmount.toFixed(2),
        row.totalAmount.toFixed(2),
        row.currency,
        row.evidenceHash,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

const royaltiesCsv = (rows: DossierRoyaltySummary[]) =>
  [
    "format,units_net,amount,currency",
    ...rows.map((row) =>
      [row.format, String(row.unitsNet), row.amount.toFixed(2), row.currency]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");

const purchasesCsv=(rows:DossierPurchase[])=>['document_number,issue_date,category,currency,tax_base,vat_amount,total_amount,withholding,decision_status,deductible_irpf,deductible_vat,rule_version',...rows.map(row=>[row.documentNumber,row.issueDate,row.category,row.currency,row.taxBase.toFixed(2),row.vatAmount.toFixed(2),row.totalAmount.toFixed(2),row.withholdingAmount.toFixed(2),row.decisionStatus,row.deductibleIrpf.toFixed(2),row.deductibleVat.toFixed(2),row.ruleVersion].map(csvCell).join(','))].join('\n');
const decisionsCsv=(rows:DossierPurchase[])=>['document_number,rule_version,status,explanation',...rows.map(row=>[row.documentNumber,row.ruleVersion,row.decisionStatus,row.explanation].map(csvCell).join(','))].join('\n');

function createVerifactuState(input: VatDossierInput): DossierVerifactuState {
  return {
    schemaVersion: "anclora-verifactu-state-v1",
    period: input.period,
    summary: input.verifactuStatuses,
    records: input.verifactuRecords ?? [],
  };
}

async function renderSummary(input: VatDossierInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const title = await document.embedFont(StandardFonts.TimesRomanBold);
  const body = await document.embedFont(StandardFonts.Helvetica);

  page.drawText("Expediente IVA", {
    x: 48,
    y: 770,
    size: 30,
    font: title,
    color: rgb(14 / 255, 27 / 255, 44 / 255),
  });
  page.drawText(`Periodo ${input.period}`, {
    x: 48,
    y: 735,
    size: 12,
    font: body,
  });

  const base = input.invoices.reduce((sum, item) => sum + item.taxBase, 0);
  const tax = input.invoices.reduce((sum, item) => sum + item.taxAmount, 0);

  page.drawText(`Documentos: ${input.invoices.length}`, {
    x: 48,
    y: 680,
    size: 11,
    font: body,
  });
  page.drawText(`Base: ${base.toFixed(2)} EUR`, {
    x: 48,
    y: 655,
    size: 11,
    font: body,
  });
  page.drawText(`Cuota: ${tax.toFixed(2)} EUR`, {
    x: 48,
    y: 630,
    size: 11,
    font: body,
  });
  page.drawText(
    "Resumen de apoyo para asesoría. No genera ni presenta el modelo 303.",
    {
      x: 48,
      y: 80,
      size: 9,
      font: body,
      color: rgb(0.35, 0.38, 0.42),
    },
  );

  return document.save();
}

export async function createVatDossier(
  input: VatDossierInput,
): Promise<VatDossierResult> {
  if (
    input.issues.some(
      (issue) => issue.severity === "BLOCKING" && issue.status === "OPEN",
    ) &&
    !input.blockingApprovalId
  ) {
    throw new Error("BLOCKING_ISSUES_REQUIRE_APPROVAL");
  }

  const csvBytes = strToU8(csv(input.invoices));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(input.invoices),
    "Facturas",
  );
  const xlsxBytes = new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
  );
  const summaryBytes = await renderSummary(input);
  const verifactuState = createVerifactuState(input);

  const files: Record<string, Uint8Array> = {
    "facturas.csv": csvBytes,
    "facturas.xlsx": xlsxBytes,
    "resumen-iva.pdf": summaryBytes,
    "estado-verifactu.json": jsonBytes(verifactuState),
    "regalias-kdp.csv": strToU8(royaltiesCsv(input.royaltiesByFormat ?? [])),
    "advertencias.json": jsonBytes({
      schemaVersion: "anclora-dossier-warnings-v1",
      period: input.period,
      warnings: input.warnings ?? [],
    }),
    "purchases.csv": strToU8(purchasesCsv(input.purchases ?? [])),
    "expense-deductibility.csv": strToU8(decisionsCsv(input.purchases ?? [])),
    "gastos-resumen.json": jsonBytes({ schemaVersion: "anclora-expenses-summary-v1", period: input.period, warning: "Informe orientativo para modelos 130/303; no presenta modelos ni sustituye asesoría", purchases: input.purchases ?? [] }),
  };

  const manifest = Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [
      name,
      createHash("sha256").update(bytes).digest("hex"),
    ]),
  );

  files["manifest.json"] = jsonBytes({
    schemaVersion: "anclora-vat-dossier-v1",
    period: input.period,
    files: manifest,
  });

  return {
    zipBytes: zipSync(files, { level: 6 }),
    manifest,
    status: "CLOSED",
    period: input.period,
  };
}

export function readVatDossierFile(
  zipBytes: Uint8Array,
  filename: string,
): Uint8Array | null {
  return unzipSync(zipBytes)[filename] ?? null;
}

export function readVatDossierJsonFile<T = unknown>(
  zipBytes: Uint8Array,
  filename: string,
): T | null {
  const file = readVatDossierFile(zipBytes, filename);

  if (!file) return null;

  return JSON.parse(new TextDecoder().decode(file)) as T;
}

export function verifyVatDossier(zipBytes: Uint8Array): boolean {
  const files = unzipSync(zipBytes);
  const manifestFile = files["manifest.json"];

  if (!manifestFile) return false;

  const parsed = JSON.parse(new TextDecoder().decode(manifestFile)) as {
    files: Record<string, string>;
  };

  return Object.entries(parsed.files).every(
    ([name, hash]) =>
      files[name] &&
      createHash("sha256").update(files[name]).digest("hex") === hash,
  );
}
