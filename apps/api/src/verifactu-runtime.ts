import {
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
  VERIFACTU_PRODUCTION_SUBMISSION_ENABLED?: string | undefined;
}

export interface ApiAeatVerifactuXmlPreflightStatus {
  enabled: boolean;
  schemaProfile: 'aeat-suministro-lr-local-preflight-v1';
  blocksInvalidXmlBeforeAdapter: boolean;
  maxRegistroFacturaPerEnvelope: number;
}

export interface ApiVerifactuRuntimeStatus extends VerifactuRuntimeConfig {
  aeatPortalReadiness: AeatVerifactuPortalReadiness;
  aeatXmlPreflight: ApiAeatVerifactuXmlPreflightStatus;
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

export function resolveApiVerifactuRuntimeStatus(
  env: ApiVerifactuEnvironment = process.env,
): ApiVerifactuRuntimeStatus {
  const runtimeConfig = resolveApiVerifactuRuntimeConfig(env);

  return {
    ...runtimeConfig,
    aeatPortalReadiness: resolveApiAeatVerifactuPortalReadiness(env),
    aeatXmlPreflight: resolveApiAeatVerifactuXmlPreflightStatus(),
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

  if (!input.adapter) {
    return {
      service: null,
      runtimeConfig,
      reason: 'VERIFACTU_ADAPTER_NOT_AVAILABLE',
    };
  }

  return {
    service: new VerifactuSubmissionExecutionService({
      repository: input.repository,
      adapter: input.adapter,
      runtimeConfig,
      ...(input.now ? { now: input.now } : {}),
    }),
    runtimeConfig,
  };
}
