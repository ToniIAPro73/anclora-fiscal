export type AeatVerifactuPortalEnvironment = 'test' | 'production';

export interface AeatVerifactuPortalReadinessInput {
  environment: AeatVerifactuPortalEnvironment;
  endpointUrl?: string | undefined;
  certificatePath?: string | undefined;
  certificatePasswordConfigured?: boolean | undefined;
  certificateFingerprint?: string | undefined;
  productionSubmissionEnabled?: boolean | undefined;
  allowAutomatedLoadTests?: boolean | undefined;
}

export interface AeatVerifactuPortalReadiness {
  environment: AeatVerifactuPortalEnvironment;
  endpointUrl: string | null;
  endpointHost: string | null;
  preproductionHost: boolean;
  certificateConfigured: boolean;
  certificateFingerprint: string | null;
  productionSubmissionEnabled: boolean;
  allowAutomatedLoadTests: boolean;
  ready: boolean;
  blockedReasons: string[];
  warnings: string[];
  usagePolicy: 'manual-preproduction-tests-only' | 'production-submission';
}

export function resolveAeatVerifactuPortalReadiness(
  input: AeatVerifactuPortalReadinessInput,
): AeatVerifactuPortalReadiness {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  const endpointUrl = input.endpointUrl?.trim() ?? '';
  const parsedEndpoint = parseEndpoint(endpointUrl, blockedReasons);
  const endpointHost = parsedEndpoint?.hostname ?? null;
  const preproductionHost = endpointHost ? isRecognizedPreproductionHost(endpointHost) : false;

  const certificatePath = input.certificatePath?.trim() ?? '';
  const certificatePasswordConfigured = input.certificatePasswordConfigured === true;
  const certificateFingerprint = normalizeCertificateFingerprint(input.certificateFingerprint, blockedReasons);

  if (!certificatePath) {
    blockedReasons.push('AEAT_VERIFACTU_CERTIFICATE_PATH_REQUIRED');
  }

  if (!certificatePasswordConfigured) {
    blockedReasons.push('AEAT_VERIFACTU_CERTIFICATE_PASSWORD_REQUIRED');
  }

  if (!certificateFingerprint) {
    blockedReasons.push('AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_REQUIRED');
  }

  const productionSubmissionEnabled = input.productionSubmissionEnabled === true;
  const allowAutomatedLoadTests = input.allowAutomatedLoadTests === true;

  if (input.environment === 'test') {
    if (endpointHost && !preproductionHost) {
      warnings.push('AEAT_VERIFACTU_TEST_ENDPOINT_NOT_RECOGNIZED_AS_PREPRODUCTION');
    }

    if (allowAutomatedLoadTests) {
      blockedReasons.push('AEAT_VERIFACTU_PREPRODUCTION_LOAD_TESTS_NOT_ALLOWED');
    }
  }

  if (input.environment === 'production') {
    if (!productionSubmissionEnabled) {
      blockedReasons.push('AEAT_VERIFACTU_PRODUCTION_SUBMISSION_NOT_ENABLED');
    }

    if (preproductionHost) {
      blockedReasons.push('AEAT_VERIFACTU_PRODUCTION_ENDPOINT_POINTS_TO_PREPRODUCTION');
    }
  }

  return {
    environment: input.environment,
    endpointUrl: parsedEndpoint?.toString() ?? (endpointUrl || null),
    endpointHost,
    preproductionHost,
    certificateConfigured: Boolean(certificatePath && certificatePasswordConfigured && certificateFingerprint),
    certificateFingerprint: certificateFingerprint ?? null,
    productionSubmissionEnabled,
    allowAutomatedLoadTests,
    ready: blockedReasons.length === 0,
    blockedReasons,
    warnings,
    usagePolicy: input.environment === 'production'
      ? 'production-submission'
      : 'manual-preproduction-tests-only',
  };
}

function parseEndpoint(endpointUrl: string, blockedReasons: string[]): URL | null {
  if (!endpointUrl) {
    blockedReasons.push('AEAT_VERIFACTU_ENDPOINT_REQUIRED');
    return null;
  }

  try {
    const parsed = new URL(endpointUrl);

    if (parsed.protocol !== 'https:') {
      blockedReasons.push('AEAT_VERIFACTU_ENDPOINT_REQUIRES_HTTPS');
    }

    return parsed;
  } catch {
    blockedReasons.push('AEAT_VERIFACTU_ENDPOINT_INVALID');
    return null;
  }
}

function isRecognizedPreproductionHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return normalized === 'preportal.aeat.es'
    || normalized.startsWith('prewww1.aeat.es')
    || normalized.startsWith('prewww2.aeat.es')
    || normalized.startsWith('prewww10.aeat.es');
}

function normalizeCertificateFingerprint(
  value: string | undefined,
  blockedReasons: string[],
): string | undefined {
  const raw = value?.trim();

  if (!raw) return undefined;

  const normalized = raw
    .replaceAll(':', '')
    .replaceAll(' ', '')
    .replaceAll('-', '')
    .toUpperCase();

  if (!/^[A-F0-9]+$/.test(normalized) || (normalized.length !== 40 && normalized.length !== 64)) {
    blockedReasons.push('AEAT_VERIFACTU_CERTIFICATE_FINGERPRINT_INVALID');
    return undefined;
  }

  return normalized;
}
