import { createHash } from 'node:crypto';
import { createIntegrityRecord } from './verifactu.js';
import { buildAeatVerifactuOperationalDiagnostics } from './verifactu-aeat-diagnostics.js';
import { validateAeatVerifactuUnsignedXml } from './verifactu-aeat-local-validation.js';
import { resolveAeatVerifactuPortalReadiness } from './verifactu-aeat-portal.js';
import { buildSoapHeaders } from './verifactu-aeat-real-soap-transport.js';
import {
  buildAeatVerifactuUnsignedXml,
  type AeatVerifactuPartyIdentity,
  type AeatVerifactuSoftwareIdentity,
} from './verifactu-aeat-xml.js';

export interface AeatVerifactuManualPreproductionSample {
  documentId: string;
  documentNumber: string;
  issuedAt: string;
  totalAmount: number;
  taxAmount: number;
}

export interface AeatVerifactuManualPreproductionDryRunInput {
  endpointUrl?: string | undefined;
  certificatePath?: string | undefined;
  certificatePasswordConfigured?: boolean | undefined;
  certificateFingerprint?: string | undefined;
  issuer: AeatVerifactuPartyIdentity;
  invoiceType?: import('./verifactu-aeat-xml.js').AeatInvoiceType | undefined;
  recipient?: AeatVerifactuPartyIdentity | undefined;
  software: AeatVerifactuSoftwareIdentity;
  sample: AeatVerifactuManualPreproductionSample;
  generatedAt: string;
  previousRecord?: {
    issuerTaxId?: string | undefined;
    documentNumber: string;
    issuedAt: string;
    huella: string;
  } | undefined;
  operationDescription?: string | undefined;
  userAgent?: string | undefined;
}

export interface AeatVerifactuManualPreproductionSoapPreview {
  endpointUrl: string | null;
  endpointHost: string | null;
  operation: 'RegFactuSistemaFacturacion';
  soapAction: '';
  contentType: 'text/xml; charset=utf-8';
  userAgent: string;
  contentLength: number;
  xmlSha256: string;
  xmlPreviewSha256: string;
}

export interface AeatVerifactuManualPreproductionDryRunReport {
  profile: 'aeat-verifactu-manual-preproduction-dry-run-v1';
  mode: 'dry-run';
  sendsNetworkRequest: false;
  canRunManualPreproductionTest: boolean;
  documentNumber: string;
  portalReady: boolean;
  xmlPreflightReady: boolean;
  nextAction: 'configure-portal' | 'fix-xml' | 'ready-for-manual-preproduction-test';
  blockingReasons: string[];
  warnings: string[];
  soapPreview: AeatVerifactuManualPreproductionSoapPreview;
}

export function buildAeatVerifactuManualPreproductionDryRun(
  input: AeatVerifactuManualPreproductionDryRunInput,
): AeatVerifactuManualPreproductionDryRunReport {
  const portalReadiness = resolveAeatVerifactuPortalReadiness({
    environment: 'test',
    endpointUrl: input.endpointUrl,
    certificatePath: input.certificatePath,
    certificatePasswordConfigured: input.certificatePasswordConfigured,
    certificateFingerprint: input.certificateFingerprint,
    productionSubmissionEnabled: false,
    allowAutomatedLoadTests: false,
  });

  const record = createIntegrityRecord({
    documentId: input.sample.documentId,
    documentNumber: input.sample.documentNumber,
    recordType: 'ALTA',
    issuedAt: input.sample.issuedAt,
    totalAmount: input.sample.totalAmount,
    taxAmount: input.sample.taxAmount,
  }, input.generatedAt);

  const unsignedPayload = buildAeatVerifactuUnsignedXml({
    environment: 'test',
    record,
    issuer: input.issuer,
    invoiceType: input.invoiceType ?? (input.recipient ? 'F1' : 'F2'),
    recipient: input.recipient,
    software: input.software,
    generatedAt: input.generatedAt,
    previousRecord: input.previousRecord,
    operationDescription: input.operationDescription ?? 'Prueba manual controlada de preproducción VERI*FACTU',
    externalReference: input.sample.documentId,
  });

  const xmlValidationReport = validateAeatVerifactuUnsignedXml(unsignedPayload);
  const diagnostics = buildAeatVerifactuOperationalDiagnostics({
    portalReadiness,
    xmlValidationReport,
  });

  const headers = buildSoapHeaders(unsignedPayload.xml, input.userAgent);
  const contentLength = Number(headers['content-length'] ?? 0);

  return {
    profile: 'aeat-verifactu-manual-preproduction-dry-run-v1',
    mode: 'dry-run',
    sendsNetworkRequest: false,
    canRunManualPreproductionTest: diagnostics.canRunManualPreproductionTest,
    documentNumber: input.sample.documentNumber,
    portalReady: diagnostics.portalReady,
    xmlPreflightReady: diagnostics.xmlPreflightReady,
    nextAction: diagnostics.nextAction,
    blockingReasons: diagnostics.blockingReasons,
    warnings: diagnostics.warnings,
    soapPreview: {
      endpointUrl: portalReadiness.endpointUrl,
      endpointHost: portalReadiness.endpointHost,
      operation: 'RegFactuSistemaFacturacion',
      soapAction: '',
      contentType: 'text/xml; charset=utf-8',
      userAgent: headers['user-agent'] ?? 'Anclora-Fiscal-Verifactu-Test/0.1',
      contentLength,
      xmlSha256: unsignedPayload.xmlSha256,
      xmlPreviewSha256: sha256(unsignedPayload.xml.slice(0, 500)),
    },
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
