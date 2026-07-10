#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION,
  runAeatVerifactuManualPreproductionSubmit,
} from '../packages/core/dist/verifactu-aeat-manual-preproduction-submit.js';
import {
  AeatVerifactuRealSoapTransport,
} from '../packages/core/dist/verifactu-aeat-real-soap-transport.js';

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function bool(name) {
  return String(process.env[name] ?? '').trim().toLowerCase() === 'true';
}

function numericEnv(name, fallback) {
  const value = Number(env(name, fallback));
  if (!Number.isFinite(value)) {
    throw new Error(`${name}_INVALID`);
  }

  return value;
}

async function main() {
  const networkEnabled = bool('VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED');
  const confirmation = env('VERIFACTU_AEAT_PREPRODUCTION_MANUAL_CONFIRM');

  const transport = new AeatVerifactuRealSoapTransport({
    enabled: networkEnabled,
    certificate: {
      pfxPath: env('VERIFACTU_AEAT_CERTIFICATE_PATH'),
      passphrase: env('VERIFACTU_AEAT_CERTIFICATE_PASSWORD'),
      caPath: env('VERIFACTU_AEAT_CA_PATH') || undefined,
    },
    timeoutMs: numericEnv('VERIFACTU_AEAT_TIMEOUT_MS', '30000'),
    userAgent: env('VERIFACTU_AEAT_USER_AGENT', 'Anclora-Fiscal-Verifactu-Manual-Preproduction/0.1'),
  });

  const report = await runAeatVerifactuManualPreproductionSubmit({
    endpointUrl: env('VERIFACTU_AEAT_TEST_ENDPOINT_URL'),
    certificatePath: env('VERIFACTU_AEAT_CERTIFICATE_PATH'),
    certificatePasswordConfigured: Boolean(env('VERIFACTU_AEAT_CERTIFICATE_PASSWORD')),
    certificateFingerprint: env('VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT'),
    issuer: {
      taxId: env('VERIFACTU_ISSUER_NIF', 'B12345678'),
      name: env('VERIFACTU_ISSUER_NAME', 'Anclora Fiscal Test'),
    },
    recipient: {
      taxId: env('VERIFACTU_RECIPIENT_NIF', env('VERIFACTU_ISSUER_NIF', 'B12345678')),
      name: env('VERIFACTU_RECIPIENT_NAME', env('VERIFACTU_ISSUER_NAME', 'Cliente Prueba VERIFACTU')),
    },
    software: {
      name: env('VERIFACTU_SOFTWARE_NAME', 'Anclora Fiscal'),
      id: env('VERIFACTU_SOFTWARE_ID', 'AF'),
      version: env('VERIFACTU_SOFTWARE_VERSION', '0.1.0'),
      installationNumber: env('VERIFACTU_SOFTWARE_INSTALLATION_NUMBER', 'LOCAL-TEST-001'),
      producer: {
        taxId: env('VERIFACTU_SOFTWARE_PRODUCER_NIF', 'B87654321'),
        name: env('VERIFACTU_SOFTWARE_PRODUCER_NAME', 'Anclora Labs'),
      },
      onlyVerifactu: true,
      multiTenant: false,
    },
    sample: {
      documentId: env('VERIFACTU_TEST_DOCUMENT_ID', 'manual-preproduction-document-1'),
      documentNumber: env('VERIFACTU_TEST_DOCUMENT_NUMBER', 'AEAT-TEST-0001'),
      issuedAt: env('VERIFACTU_TEST_ISSUED_AT', new Date().toISOString()),
      totalAmount: numericEnv('VERIFACTU_TEST_TOTAL_AMOUNT', '6.99'),
      taxAmount: numericEnv('VERIFACTU_TEST_TAX_AMOUNT', '0.27'),
    },
    generatedAt: env('VERIFACTU_TEST_GENERATED_AT', new Date().toISOString()),
    previousRecord: env('VERIFACTU_PREVIOUS_DOCUMENT_NUMBER')
      ? {
          issuerTaxId: env('VERIFACTU_PREVIOUS_ISSUER_NIF', env('VERIFACTU_ISSUER_NIF')),
          documentNumber: env('VERIFACTU_PREVIOUS_DOCUMENT_NUMBER'),
          issuedAt: env('VERIFACTU_PREVIOUS_ISSUED_AT'),
          huella: env('VERIFACTU_PREVIOUS_HUELLA'),
        }
      : undefined,
    operationDescription: env(
      'VERIFACTU_TEST_OPERATION_DESCRIPTION',
      'Prueba manual controlada de preproducción VERI*FACTU',
    ),
    userAgent: env('VERIFACTU_AEAT_USER_AGENT', 'Anclora-Fiscal-Verifactu-Manual-Preproduction/0.1'),
    networkEnabled,
    confirmation,
    transport,
  });

  const reportDir = env('VERIFACTU_AEAT_PREPRODUCTION_REPORT_DIR', 'artifacts/verifactu/preproduction');
  await mkdir(reportDir, { recursive: true });

  const stamp = report.createdAt.replaceAll(':', '').replaceAll('.', '');
  const reportPath = join(reportDir, `aeat-preproduction-submit-${stamp}.json`);

  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    ok: true,
    reportPath,
    requiredConfirmation: AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION,
    result: report.response.result,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    requiredConfirmation: AEAT_VERIFACTU_MANUAL_PREPRODUCTION_CONFIRMATION,
  }, null, 2));

  process.exitCode = 2;
});
