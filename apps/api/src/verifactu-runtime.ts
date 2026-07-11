import {
  AeatVerifactuXmlSubmissionAdapter,
  DeterministicAeatVerifactuSoapTransport,
  DeterministicAeatVerifactuXmlSigner,
  VerifactuSubmissionExecutionService,
  resolveAeatVerifactuPortalReadiness,
  resolveVerifactuRuntimeConfig,
  type AeatVerifactuPortalReadiness,
  type VerifactuPort,
  type VerifactuRuntimeConfig,
  type VerifactuSubmissionExecutionRepositoryPort,
} from '@anclora/core/server';

export interface ApiVerifactuEnvironment {
  NODE_ENV?: string | undefined;
  VERIFACTU_MODE?: string | undefined;
  VERIFACTU_ENABLED?: string | undefined;
  VERIFACTU_AEAT_ADAPTER_ENABLED?: string | undefined;
  VERIFACTU_AEAT_SIGNING_ENABLED?: string | undefined;
  VERIFACTU_AEAT_CERTIFICATE_PATH?: string | undefined;
  VERIFACTU_AEAT_CERTIFICATE_PASSWORD?: string | undefined;
  VERIFACTU_AEAT_CERTIFICATE_PASSWORD_CONFIGURED?: string | undefined;
  VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT?: string | undefined;
  VERIFACTU_AEAT_ENDPOINT_URL?: string | undefined;
  VERIFACTU_AEAT_TEST_ENDPOINT_URL?: string | undefined;
  VERIFACTU_AEAT_PRODUCTION_ENDPOINT_URL?: string | undefined;
  VERIFACTU_AEAT_ALLOW_LOAD_TESTS?: string | undefined;
  VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED?: string | undefined;
  VERIFACTU_AEAT_ISSUER_NIF?: string | undefined;
  VERIFACTU_AEAT_ISSUER_NAME?: string | undefined;
  VERIFACTU_AEAT_SOFTWARE_NAME?: string | undefined;
  VERIFACTU_AEAT_SOFTWARE_ID?: string | undefined;
  VERIFACTU_AEAT_SOFTWARE_VERSION?: string | undefined;
  VERIFACTU_AEAT_SOFTWARE_INSTALLATION_NUMBER?: string | undefined;
  VERIFACTU_AEAT_SOFTWARE_PRODUCER_NIF?: string | undefined;
  VERIFACTU_AEAT_SOFTWARE_PRODUCER_NAME?: string | undefined;
  VERIFACTU_PRODUCTION_SUBMISSION_ENABLED?: string | undefined;
}

export interface ApiAeatVerifactuXmlPreflightStatus {
  enabled: boolean;
  schemaProfile: 'aeat-suministro-lr-local-preflight-v1';
  blocksInvalidXmlBeforeAdapter: boolean;
  maxRegistroFacturaPerEnvelope: number;
}

export interface ApiAeatVerifactuSoapTransportStatus {
  implemented: boolean;
  wiredIntoSubmissionFlow: boolean;
  networkEnabled: boolean;
  operation: 'RegFactuSistemaFacturacion';
  soapAction: '';
  safety: 'disabled-by-default';
}

export interface ApiVerifactuRuntimeStatus extends VerifactuRuntimeConfig {
  aeatPortalReadiness: AeatVerifactuPortalReadiness;
  aeatXmlPreflight: ApiAeatVerifactuXmlPreflightStatus;
  aeatSoapTransport: ApiAeatVerifactuSoapTransportStatus;
}

export type CreateVerifactuExecutionServiceResult =
  | {
      service: VerifactuSubmissionExecutionService;
      runtimeConfig: VerifactuRuntimeConfig;
      reason?: undefined;
    }
  | {
      service: null;
      runtimeConfig: VerifactuRuntimeConfig;
      reason: 'VERIFACTU_RUNTIME_NOT_SUBMITTABLE' | 'VERIFACTU_ADAPTER_NOT_AVAILABLE';
    };

function flag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function normalizedMode(env: ApiVerifactuEnvironment): string | undefined {
  return env.VERIFACTU_MODE?.trim().toLowerCase();
}

function portalEnvironment(env: ApiVerifactuEnvironment): 'test' | 'production' {
  return normalizedMode(env) === 'production' ? 'production' : 'test';
}

function endpointForMode(env: ApiVerifactuEnvironment): string | undefined {
  const mode = normalizedMode(env);

  if (mode === 'production') {
    return env.VERIFACTU_AEAT_PRODUCTION_ENDPOINT_URL ?? env.VERIFACTU_AEAT_ENDPOINT_URL;
  }

  if (mode === 'test' || mode === 'sandbox') {
    return env.VERIFACTU_AEAT_TEST_ENDPOINT_URL ?? env.VERIFACTU_AEAT_ENDPOINT_URL;
  }

  return env.VERIFACTU_AEAT_ENDPOINT_URL
    ?? env.VERIFACTU_AEAT_TEST_ENDPOINT_URL
    ?? env.VERIFACTU_AEAT_PRODUCTION_ENDPOINT_URL;
}

function certificatePasswordConfigured(env: ApiVerifactuEnvironment): boolean {
  return hasText(env.VERIFACTU_AEAT_CERTIFICATE_PASSWORD)
    || flag(env.VERIFACTU_AEAT_CERTIFICATE_PASSWORD_CONFIGURED);
}

function hasInternalDeterministicAeatXmlAdapterConfiguration(
  env: ApiVerifactuEnvironment,
): boolean {
  return normalizedMode(env) === 'test'
    && !flag(env.VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED)
    && hasText(env.VERIFACTU_AEAT_ISSUER_NIF)
    && hasText(env.VERIFACTU_AEAT_ISSUER_NAME)
    && hasText(env.VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT)
    && hasText(endpointForMode(env));
}

function createInternalDeterministicAeatXmlAdapter(input: {
  env: ApiVerifactuEnvironment;
  runtimeConfig: VerifactuRuntimeConfig;
  now?: (() => string) | undefined;
}): VerifactuPort | null {
  if (!hasInternalDeterministicAeatXmlAdapterConfiguration(input.env)) {
    return null;
  }

  if (input.runtimeConfig.mode !== 'test') {
    return null;
  }

  const endpointUrl = endpointForMode(input.env);
  const issuerTaxId = input.env.VERIFACTU_AEAT_ISSUER_NIF?.trim();
  const issuerName = input.env.VERIFACTU_AEAT_ISSUER_NAME?.trim();
  const certificateFingerprint = input.env.VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT?.trim();

  if (!endpointUrl || !issuerTaxId || !issuerName || !certificateFingerprint) {
    return null;
  }

  return new AeatVerifactuXmlSubmissionAdapter(
    input.runtimeConfig,
    {
      environment: 'test',
      endpointUrl,
      issuer: {
        taxId: issuerTaxId,
        name: issuerName,
      },
      software: {
        name: input.env.VERIFACTU_AEAT_SOFTWARE_NAME?.trim() || 'Anclora Fiscal',
        id: input.env.VERIFACTU_AEAT_SOFTWARE_ID?.trim() || 'AF',
        version: input.env.VERIFACTU_AEAT_SOFTWARE_VERSION?.trim() || '0.1.0',
        installationNumber:
          input.env.VERIFACTU_AEAT_SOFTWARE_INSTALLATION_NUMBER?.trim()
          || 'LOCAL-TEST-001',
        producer: {
          taxId:
            input.env.VERIFACTU_AEAT_SOFTWARE_PRODUCER_NIF?.trim()
            || issuerTaxId,
          name:
            input.env.VERIFACTU_AEAT_SOFTWARE_PRODUCER_NAME?.trim()
            || issuerName,
        },
        onlyVerifactu: true,
        multiTenant: false,
      },
      certificateFingerprint,
      signer: new DeterministicAeatVerifactuXmlSigner(),
      transport: new DeterministicAeatVerifactuSoapTransport(
        input.now ?? (() => new Date().toISOString()),
      ),
      ...(input.now ? { now: input.now } : {}),
    },
  );
}

export function resolveApiAeatVerifactuPortalReadiness(
  env: ApiVerifactuEnvironment = process.env,
): AeatVerifactuPortalReadiness {
  return resolveAeatVerifactuPortalReadiness({
    environment: portalEnvironment(env),
    endpointUrl: endpointForMode(env),
    certificatePath: env.VERIFACTU_AEAT_CERTIFICATE_PATH,
    certificatePasswordConfigured: certificatePasswordConfigured(env),
    certificateFingerprint: env.VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT,
    productionSubmissionEnabled: flag(env.VERIFACTU_PRODUCTION_SUBMISSION_ENABLED),
    allowAutomatedLoadTests: flag(env.VERIFACTU_AEAT_ALLOW_LOAD_TESTS),
  });
}

export function hasAeatVerifactuAdapterConfiguration(
  env: ApiVerifactuEnvironment = process.env,
): boolean {
  return flag(env.VERIFACTU_AEAT_ADAPTER_ENABLED)
    && resolveApiAeatVerifactuPortalReadiness(env).ready;
}

export function resolveApiVerifactuRuntimeConfig(
  env: ApiVerifactuEnvironment = process.env,
): VerifactuRuntimeConfig {
  return resolveVerifactuRuntimeConfig({
    mode: env.VERIFACTU_MODE,
    enabled: env.VERIFACTU_ENABLED,
    nodeEnv: env.NODE_ENV,
    adapterConfigured: hasAeatVerifactuAdapterConfiguration(env),
    productionSubmissionEnabled: flag(env.VERIFACTU_PRODUCTION_SUBMISSION_ENABLED),
  });
}

export function resolveApiAeatVerifactuXmlPreflightStatus(): ApiAeatVerifactuXmlPreflightStatus {
  return {
    enabled: true,
    schemaProfile: 'aeat-suministro-lr-local-preflight-v1',
    blocksInvalidXmlBeforeAdapter: true,
    maxRegistroFacturaPerEnvelope: 1000,
  };
}

export function resolveApiAeatVerifactuSoapTransportStatus(
  env: ApiVerifactuEnvironment = process.env,
): ApiAeatVerifactuSoapTransportStatus {
  return {
    implemented: true,
    wiredIntoSubmissionFlow: hasInternalDeterministicAeatXmlAdapterConfiguration(env),
    networkEnabled: flag(env.VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED),
    operation: 'RegFactuSistemaFacturacion',
    soapAction: '',
    safety: 'disabled-by-default',
  };
}

export function resolveApiVerifactuRuntimeStatus(
  env: ApiVerifactuEnvironment = process.env,
): ApiVerifactuRuntimeStatus {
  const runtimeConfig = resolveApiVerifactuRuntimeConfig(env);

  return {
    ...runtimeConfig,
    aeatPortalReadiness: resolveApiAeatVerifactuPortalReadiness(env),
    aeatXmlPreflight: resolveApiAeatVerifactuXmlPreflightStatus(),
    aeatSoapTransport: resolveApiAeatVerifactuSoapTransportStatus(env),
  };
}

export function createInternalVerifactuSubmissionExecutionService(input: {
  repository: VerifactuSubmissionExecutionRepositoryPort;
  adapter?: VerifactuPort | undefined;
  env?: ApiVerifactuEnvironment | undefined;
  now?: (() => string) | undefined;
}): CreateVerifactuExecutionServiceResult {
  const runtimeConfig = resolveApiVerifactuRuntimeConfig(input.env);

  if (!runtimeConfig.enabled || !runtimeConfig.canSubmit) {
    return {
      service: null,
      runtimeConfig,
      reason: 'VERIFACTU_RUNTIME_NOT_SUBMITTABLE',
    };
  }

  const env = input.env ?? process.env;
  const adapter = input.adapter
    ?? createInternalDeterministicAeatXmlAdapter({
      env,
      runtimeConfig,
      ...(input.now ? { now: input.now } : {}),
    });

  if (!adapter) {
    return {
      service: null,
      runtimeConfig,
      reason: 'VERIFACTU_ADAPTER_NOT_AVAILABLE',
    };
  }

  return {
    service: new VerifactuSubmissionExecutionService({
      repository: input.repository,
      adapter,
      runtimeConfig,
      ...(input.now ? { now: input.now } : {}),
    }),
    runtimeConfig,
  };
}
