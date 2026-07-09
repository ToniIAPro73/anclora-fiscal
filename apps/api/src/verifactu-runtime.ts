import {
  VerifactuSubmissionExecutionService,
  resolveVerifactuRuntimeConfig,
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
  VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT?: string | undefined;
  VERIFACTU_AEAT_ENDPOINT_URL?: string | undefined;
  VERIFACTU_AEAT_TEST_ENDPOINT_URL?: string | undefined;
  VERIFACTU_AEAT_PRODUCTION_ENDPOINT_URL?: string | undefined;
  VERIFACTU_PRODUCTION_SUBMISSION_ENABLED?: string | undefined;
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

function endpointConfigured(env: ApiVerifactuEnvironment): boolean {
  const mode = normalizedMode(env);

  if (mode === 'production') {
    return hasText(env.VERIFACTU_AEAT_PRODUCTION_ENDPOINT_URL) || hasText(env.VERIFACTU_AEAT_ENDPOINT_URL);
  }

  if (mode === 'test' || mode === 'sandbox') {
    return hasText(env.VERIFACTU_AEAT_TEST_ENDPOINT_URL) || hasText(env.VERIFACTU_AEAT_ENDPOINT_URL);
  }

  return false;
}

export function hasAeatVerifactuAdapterConfiguration(env: ApiVerifactuEnvironment = process.env): boolean {
  return flag(env.VERIFACTU_AEAT_ADAPTER_ENABLED)
    && flag(env.VERIFACTU_AEAT_SIGNING_ENABLED)
    && hasText(env.VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT)
    && endpointConfigured(env);
}

export function resolveApiVerifactuRuntimeConfig(env: ApiVerifactuEnvironment = process.env): VerifactuRuntimeConfig {
  return resolveVerifactuRuntimeConfig({
    mode: env.VERIFACTU_MODE,
    enabled: env.VERIFACTU_ENABLED,
    nodeEnv: env.NODE_ENV,
    adapterConfigured: hasAeatVerifactuAdapterConfiguration(env),
    productionSubmissionEnabled: flag(env.VERIFACTU_PRODUCTION_SUBMISSION_ENABLED),
  });
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
