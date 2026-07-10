#!/usr/bin/env node

import { buildAeatVerifactuManualPreproductionDryRun } from '../packages/core/dist/server.js';

function bool(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function requiredEnv(name, fallback = '') {
  return process.env[name] ?? fallback;
}

const report = buildAeatVerifactuManualPreproductionDryRun({
  endpointUrl: requiredEnv('VERIFACTU_AEAT_TEST_ENDPOINT_URL'),
  certificatePath: requiredEnv('VERIFACTU_AEAT_CERTIFICATE_PATH'),
  certificatePasswordConfigured: Boolean(process.env.VERIFACTU_AEAT_CERTIFICATE_PASSWORD)
    || bool(process.env.VERIFACTU_AEAT_CERTIFICATE_PASSWORD_CONFIGURED),
  certificateFingerprint: requiredEnv('VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT'),
  issuer: {
    taxId: requiredEnv('VERIFACTU_ISSUER_NIF', 'B12345678'),
    name: requiredEnv('VERIFACTU_ISSUER_NAME', 'Anclora Fiscal Test'),
  },
  recipient: {
    taxId: requiredEnv('VERIFACTU_RECIPIENT_NIF', requiredEnv('VERIFACTU_ISSUER_NIF', 'B12345678')),
    name: requiredEnv('VERIFACTU_RECIPIENT_NAME', requiredEnv('VERIFACTU_ISSUER_NAME', 'Cliente Prueba VERIFACTU')),
  },
  software: {
    name: requiredEnv('VERIFACTU_SOFTWARE_NAME', 'Anclora Fiscal'),
    id: requiredEnv('VERIFACTU_SOFTWARE_ID', 'AF'),
    version: requiredEnv('VERIFACTU_SOFTWARE_VERSION', '0.1.0'),
    installationNumber: requiredEnv('VERIFACTU_SOFTWARE_INSTALLATION_NUMBER', 'LOCAL-TEST-001'),
    producer: {
      taxId: requiredEnv('VERIFACTU_SOFTWARE_PRODUCER_NIF', 'B87654321'),
      name: requiredEnv('VERIFACTU_SOFTWARE_PRODUCER_NAME', 'Anclora Labs'),
    },
    onlyVerifactu: true,
    multiTenant: false,
  },
  sample: {
    documentId: requiredEnv('VERIFACTU_TEST_DOCUMENT_ID', 'manual-preproduction-document-1'),
    documentNumber: requiredEnv('VERIFACTU_TEST_DOCUMENT_NUMBER', 'AEAT-TEST-0001'),
    issuedAt: requiredEnv('VERIFACTU_TEST_ISSUED_AT', new Date().toISOString()),
    totalAmount: Number(requiredEnv('VERIFACTU_TEST_TOTAL_AMOUNT', '6.99')),
    taxAmount: Number(requiredEnv('VERIFACTU_TEST_TAX_AMOUNT', '0.27')),
  },
  generatedAt: requiredEnv('VERIFACTU_TEST_GENERATED_AT', new Date().toISOString()),
  previousRecord: requiredEnv('VERIFACTU_PREVIOUS_DOCUMENT_NUMBER')
    ? {
        issuerTaxId: requiredEnv('VERIFACTU_PREVIOUS_ISSUER_NIF', requiredEnv('VERIFACTU_ISSUER_NIF')),
        documentNumber: requiredEnv('VERIFACTU_PREVIOUS_DOCUMENT_NUMBER'),
        issuedAt: requiredEnv('VERIFACTU_PREVIOUS_ISSUED_AT'),
        huella: requiredEnv('VERIFACTU_PREVIOUS_HUELLA'),
      }
    : undefined,
  userAgent: requiredEnv('VERIFACTU_AEAT_USER_AGENT', 'Anclora-Fiscal-Verifactu-Manual-DryRun/0.1'),
});

console.log(JSON.stringify(report, null, 2));

if (!report.canRunManualPreproductionTest) {
  process.exitCode = 2;
}
