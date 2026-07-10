#!/usr/bin/env node

import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';

const CONFIRMATION = 'I_UNDERSTAND_THIS_SENDS_TO_AEAT_PREPRODUCTION';

const required = [
  'VERIFACTU_AEAT_TEST_ENDPOINT_URL',
  'VERIFACTU_AEAT_CERTIFICATE_PATH',
  'VERIFACTU_AEAT_CERTIFICATE_PASSWORD',
  'VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT',
  'VERIFACTU_ISSUER_NIF',
  'VERIFACTU_ISSUER_NAME',
  'VERIFACTU_SOFTWARE_PRODUCER_NIF',
  'VERIFACTU_SOFTWARE_PRODUCER_NAME',
];

const optional = [
  'VERIFACTU_SOFTWARE_NAME',
  'VERIFACTU_SOFTWARE_ID',
  'VERIFACTU_SOFTWARE_VERSION',
  'VERIFACTU_SOFTWARE_INSTALLATION_NUMBER',
  'VERIFACTU_AEAT_USER_AGENT',
  'VERIFACTU_AEAT_TIMEOUT_MS',
  'VERIFACTU_TEST_DOCUMENT_ID',
  'VERIFACTU_TEST_DOCUMENT_NUMBER',
  'VERIFACTU_TEST_TOTAL_AMOUNT',
  'VERIFACTU_TEST_TAX_AMOUNT',
];

function value(name) {
  return String(process.env[name] ?? '').trim();
}

function isPlaceholder(name, current) {
  if (!current) return false;

  const placeholders = [
    '/ruta/local/certificado.p12',
    '***',
    'HUELLA_CERTIFICADO',
    'B12345678',
    'B87654321',
    'Anclora Fiscal Test',
    'Anclora Labs',
  ];

  if (placeholders.includes(current)) return true;

  if (name.includes('NIF') && /^[A-Z]12345678$/.test(current)) return true;
  if (name.includes('FINGERPRINT') && current.length < 40) return true;

  return false;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function maskSecret(text) {
  if (!text) return '';
  return `${text.slice(0, 2)}…${text.slice(-2)} (${text.length} chars)`;
}

function validateEndpoint(endpointUrl) {
  const issues = [];

  try {
    const url = new URL(endpointUrl);

    if (url.protocol !== 'https:') {
      issues.push('El endpoint debe usar HTTPS.');
    }

    const host = url.hostname.toLowerCase();
    const preproduction = host === 'preportal.aeat.es'
      || host.startsWith('prewww1.aeat.es')
      || host.startsWith('prewww2.aeat.es')
      || host.startsWith('prewww10.aeat.es');

    if (!preproduction) {
      issues.push(`El host no parece de preproducción AEAT: ${host}`);
    }

    return {
      ok: issues.length === 0,
      host,
      issues,
    };
  } catch {
    return {
      ok: false,
      host: null,
      issues: ['Endpoint AEAT inválido.'],
    };
  }
}

function validateFingerprint(fingerprint) {
  const normalized = fingerprint.replaceAll(':', '').replaceAll(' ', '').trim().toUpperCase();

  if (!normalized) {
    return { ok: false, normalized, issue: 'Huella vacía.' };
  }

  if (!/^[A-F0-9]+$/.test(normalized)) {
    return { ok: false, normalized, issue: 'La huella debe estar en hexadecimal.' };
  }

  if (![40, 64].includes(normalized.length)) {
    return {
      ok: false,
      normalized,
      issue: `Longitud de huella inesperada: ${normalized.length}. Esperado habitual: 40 SHA-1 o 64 SHA-256.`,
    };
  }

  return { ok: true, normalized, issue: null };
}

async function validateCertificate(path) {
  if (!path) {
    return {
      ok: false,
      exists: false,
      readable: false,
      sizeBytes: 0,
      issue: 'Ruta del certificado vacía.',
    };
  }

  try {
    await access(path, constants.R_OK);
    const info = await stat(path);

    return {
      ok: info.isFile() && info.size > 0,
      exists: true,
      readable: true,
      sizeBytes: info.size,
      issue: info.isFile() && info.size > 0 ? null : 'La ruta no apunta a un fichero válido.',
    };
  } catch {
    return {
      ok: false,
      exists: false,
      readable: false,
      sizeBytes: 0,
      issue: 'No se puede leer el certificado en la ruta indicada.',
    };
  }
}

async function main() {
  const missing = required.filter((name) => !value(name));
  const placeholders = [...required, ...optional]
    .filter((name) => isPlaceholder(name, value(name)))
    .map((name) => ({ name, value: value(name) }));

  const endpoint = validateEndpoint(value('VERIFACTU_AEAT_TEST_ENDPOINT_URL'));
  const certificate = await validateCertificate(value('VERIFACTU_AEAT_CERTIFICATE_PATH'));
  const fingerprint = validateFingerprint(value('VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT'));

  const networkGate = value('VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED') === 'true';
  const confirmationGate = value('VERIFACTU_AEAT_PREPRODUCTION_MANUAL_CONFIRM') === CONFIRMATION;

  const blockingReasons = [];

  if (missing.length > 0) {
    blockingReasons.push(`Faltan variables requeridas: ${missing.join(', ')}`);
  }

  if (placeholders.length > 0) {
    blockingReasons.push(`Hay valores placeholder: ${placeholders.map((entry) => entry.name).join(', ')}`);
  }

  if (!endpoint.ok) {
    blockingReasons.push(...endpoint.issues);
  }

  if (!certificate.ok) {
    blockingReasons.push(certificate.issue);
  }

  if (!fingerprint.ok) {
    blockingReasons.push(fingerprint.issue);
  }

  if (!networkGate) {
    blockingReasons.push('Safety gate de red no activado: VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED=true');
  }

  if (!confirmationGate) {
    blockingReasons.push('Confirmación literal no activada.');
  }

  const report = {
    ok: blockingReasons.length === 0,
    profile: 'aeat-verifactu-preproduction-env-check-v1',
    checkedAt: new Date().toISOString(),
    endpoint: {
      host: endpoint.host,
      ok: endpoint.ok,
      issues: endpoint.issues,
    },
    certificate: {
      path: value('VERIFACTU_AEAT_CERTIFICATE_PATH'),
      exists: certificate.exists,
      readable: certificate.readable,
      sizeBytes: certificate.sizeBytes,
    },
    fingerprint: {
      ok: fingerprint.ok,
      normalizedSha256: fingerprint.normalized ? sha256(fingerprint.normalized) : null,
      length: fingerprint.normalized.length,
    },
    gates: {
      networkEnabled: networkGate,
      confirmationAccepted: confirmationGate,
    },
    identity: {
      issuerNif: value('VERIFACTU_ISSUER_NIF'),
      issuerName: value('VERIFACTU_ISSUER_NAME'),
      producerNif: value('VERIFACTU_SOFTWARE_PRODUCER_NIF'),
      producerName: value('VERIFACTU_SOFTWARE_PRODUCER_NAME'),
    },
    secrets: {
      certificatePassword: value('VERIFACTU_AEAT_CERTIFICATE_PASSWORD') ? maskSecret(value('VERIFACTU_AEAT_CERTIFICATE_PASSWORD')) : '',
    },
    placeholders,
    blockingReasons,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
  }, null, 2));

  process.exitCode = 2;
});
