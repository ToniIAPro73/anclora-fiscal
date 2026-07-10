import { createHash } from 'node:crypto';
import { createIntegrityRecord, type VerifactuSubmissionResult } from './verifactu.js';
import {
  buildAeatVerifactuManualPreproductionDryRun,
  type AeatVerifactuManualPreproductionDryRunInput,
  type AeatVerifactuManualPreproductionDryRunReport,
} from './verifactu-aeat-manual-preproduction.js';
import type {
  AeatVerifactuSoapTransportPort,
} from './verifactu-aeat-transport.js';
import { parseAeatVerifactuSoapResponse } from './verifactu-aeat-transport.js';
import type { AeatVerifactuSignedXmlPayload } from './verifactu-aeat-signing.js';
import {
  buildAeatVerifactuUnsignedXml,
  type AeatVerifactuUnsignedXmlPayload,
} from './verifactu-aeat-xml.js';
import { validateAeatVerifactuUnsignedXml } from './verifactu-aeat-local-validation.js';

export const AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION =
  'I_UNDERSTAND_THIS_SENDS_TO_AEAT_PREPRODUCTION';

export interface AeatVerifactuManualPreproductionSubmitInput
  extends AeatVerifactuManualPreproductionDryRunInput {
  networkEnabled: boolean;
  confirmation?: string | undefined;
  transport: AeatVerifactuSoapTransportPort;
}

export interface AeatVerifactuManualPreproductionSubmitReport {
  profile: 'aeat-verifactu-manual-preproduction-submit-v1';
  mode: 'manual-preproduction-submit';
  sendsNetworkRequest: true;
  createdAt: string;
  dryRun: AeatVerifactuManualPreproductionDryRunReport;
  request: {
    endpointUrl: string;
    endpointHost: string | null;
    documentNumber: string;
    recordType: 'ALTA';
    usesXmlSignature: false;
    xmlSha256: string;
    xmlBytes: number;
  };
  response: {
    statusCode: number;
    receivedAt: string;
    bodySha256: string;
    result: VerifactuSubmissionResult;
  };
}

export async function runAeatVerifactuManualPreproductionSubmit(
  input: AeatVerifactuManualPreproductionSubmitInput,
): Promise<AeatVerifactuManualPreproductionSubmitReport> {
  if (!input.networkEnabled) {
    throw new Error('AEAT_VERIFACTU_MANUAL_PREPRODUCTION_NETWORK_DISABLED');
  }

  if (input.confirmation !== AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION) {
    throw new Error('AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION_REQUIRED');
  }

  const dryRun = buildAeatVerifactuManualPreproductionDryRun(input);

  if (!dryRun.canRunManualPreproductionTest) {
    throw new Error(
      `AEAT_VERIFACTU_MANUAL_PREPRODUCTION_NOT_READY:${dryRun.blockingReasons[0] ?? 'UNKNOWN'}`,
    );
  }

  const endpointUrl = input.endpointUrl?.trim() ?? '';
  if (!endpointUrl) {
    throw new Error('AEAT_VERIFACTU_ENDPOINT_REQUIRED');
  }

  const certificateFingerprint = input.certificateFingerprint?.trim() ?? '';
  if (!certificateFingerprint) {
    throw new Error('AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_REQUIRED');
  }

  const unsignedPayload = buildManualPreproductionUnsignedPayload(input);
  const validationReport = validateAeatVerifactuUnsignedXml(unsignedPayload);

  if (!validationReport.valid) {
    throw new Error(
      `AEAT_VERIFACTU_XML_PREFLIGHT_FAILED:${validationReport.blockingIssues[0]?.code ?? 'UNKNOWN'}`,
    );
  }

  const transportPayload = buildUnsignedVoluntaryTransportPayload({
    unsignedPayload,
    certificateFingerprint,
    generatedAt: input.generatedAt,
  });

  const response = await input.transport.submit({
    environment: 'test',
    endpointUrl,
    signedPayload: transportPayload,
  });

  const result = parseAeatVerifactuSoapResponse(response);

  return {
    profile: 'aeat-verifactu-manual-preproduction-submit-v1',
    mode: 'manual-preproduction-submit',
    sendsNetworkRequest: true,
    createdAt: new Date().toISOString(),
    dryRun,
    request: {
      endpointUrl,
      endpointHost: dryRun.soapPreview.endpointHost,
      documentNumber: unsignedPayload.documentNumber,
      recordType: 'ALTA',
      usesXmlSignature: false,
      xmlSha256: unsignedPayload.xmlSha256,
      xmlBytes: Buffer.byteLength(unsignedPayload.xml, 'utf8'),
    },
    response: {
      statusCode: response.statusCode,
      receivedAt: response.receivedAt,
      bodySha256: sha256(response.body),
      result,
    },
  };
}

function buildManualPreproductionUnsignedPayload(
  input: AeatVerifactuManualPreproductionDryRunInput,
): AeatVerifactuUnsignedXmlPayload {
  const record = createIntegrityRecord({
    documentId: input.sample.documentId,
    documentNumber: input.sample.documentNumber,
    recordType: 'ALTA',
    issuedAt: input.sample.issuedAt,
    totalAmount: input.sample.totalAmount,
    taxAmount: input.sample.taxAmount,
  }, input.generatedAt);

  return buildAeatVerifactuUnsignedXml({
    environment: 'test',
    record,
    issuer: input.issuer,
    recipient: input.recipient ?? input.issuer,
    software: input.software,
    generatedAt: input.generatedAt,
    previousRecord: input.previousRecord,
    operationDescription: input.operationDescription
      ?? 'Prueba manual controlada de preproducción VERI*FACTU',
    externalReference: input.sample.documentId,
  });
}

function buildUnsignedVoluntaryTransportPayload(input: {
  unsignedPayload: AeatVerifactuUnsignedXmlPayload;
  certificateFingerprint: string;
  generatedAt: string;
}): AeatVerifactuSignedXmlPayload {
  return {
    schemaVersion: 'anclora-aeat-verifactu-signed-xml-draft-v1',
    environment: input.unsignedPayload.environment,
    recordType: input.unsignedPayload.recordType,
    documentNumber: input.unsignedPayload.documentNumber,
    chainHash: input.unsignedPayload.chainHash,
    unsignedXmlSha256: input.unsignedPayload.xmlSha256,
    signedXml: input.unsignedPayload.xml,
    signedXmlSha256: input.unsignedPayload.xmlSha256,
    signatureDigest: 'UNSIGNED_VOLUNTARY_VERIFACTU',
    certificateFingerprint: input.certificateFingerprint,
    signedAt: input.generatedAt,
    signingMode: 'deterministic-test',
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
