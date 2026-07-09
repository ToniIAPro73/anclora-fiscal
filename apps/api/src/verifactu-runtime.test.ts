import { describe, expect, it, vi } from 'vitest';
import { VerifactuSubmissionExecutionService } from '@anclora/core/server';
import {
  createInternalVerifactuSubmissionExecutionService,
  hasAeatVerifactuAdapterConfiguration,
  resolveApiVerifactuRuntimeConfig,
  type ApiVerifactuEnvironment,
} from './verifactu-runtime';

const testAdapterEnv: ApiVerifactuEnvironment = {
  NODE_ENV: 'production',
  VERIFACTU_MODE: 'test',
  VERIFACTU_AEAT_ADAPTER_ENABLED: 'true',
  VERIFACTU_AEAT_SIGNING_ENABLED: 'true',
  VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT: 'cert-fp-1',
  VERIFACTU_AEAT_TEST_ENDPOINT_URL: 'https://aeat.test.example/verifactu',
};

const repository = {
  findPendingById: vi.fn(),
  applyAttemptOutcome: vi.fn(),
};

describe('resolveApiVerifactuRuntimeConfig', () => {
  it('mantiene VERI*FACTU desactivado por defecto', () => {
    expect(resolveApiVerifactuRuntimeConfig({ NODE_ENV: 'test' })).toEqual({
      mode: 'disabled',
      enabled: false,
      canSubmit: false,
      productionSafe: true,
    });
  });

  it('mantiene modo test no submittable si falta configuración AEAT', () => {
    expect(resolveApiVerifactuRuntimeConfig({
      NODE_ENV: 'production',
      VERIFACTU_MODE: 'test',
    })).toMatchObject({
      mode: 'test',
      enabled: true,
      canSubmit: false,
      productionSafe: true,
    });
  });

  it('detecta configuración AEAT completa para entorno de pruebas', () => {
    expect(hasAeatVerifactuAdapterConfiguration(testAdapterEnv)).toBe(true);

    expect(resolveApiVerifactuRuntimeConfig(testAdapterEnv)).toMatchObject({
      mode: 'test',
      enabled: true,
      canSubmit: true,
      productionSafe: true,
    });
  });

  it('mantiene producción bloqueada aunque haya adapter si no se habilita expresamente el envío productivo', () => {
    const env: ApiVerifactuEnvironment = {
      NODE_ENV: 'production',
      VERIFACTU_MODE: 'production',
      VERIFACTU_AEAT_ADAPTER_ENABLED: 'true',
      VERIFACTU_AEAT_SIGNING_ENABLED: 'true',
      VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT: 'cert-fp-1',
      VERIFACTU_AEAT_PRODUCTION_ENDPOINT_URL: 'https://aeat.production.example/verifactu',
    };

    expect(resolveApiVerifactuRuntimeConfig(env)).toMatchObject({
      mode: 'production',
      enabled: true,
      canSubmit: false,
      productionSafe: false,
    });

    expect(resolveApiVerifactuRuntimeConfig({
      ...env,
      VERIFACTU_PRODUCTION_SUBMISSION_ENABLED: 'true',
    })).toMatchObject({
      mode: 'production',
      enabled: true,
      canSubmit: true,
      productionSafe: true,
    });
  });
});

describe('createInternalVerifactuSubmissionExecutionService', () => {
  it('no construye servicio si runtime no permite envío', () => {
    const result = createInternalVerifactuSubmissionExecutionService({
      repository,
      env: {
        NODE_ENV: 'production',
        VERIFACTU_MODE: 'test',
      },
    });

    expect(result).toMatchObject({
      service: null,
      reason: 'VERIFACTU_RUNTIME_NOT_SUBMITTABLE',
      runtimeConfig: {
        mode: 'test',
        canSubmit: false,
      },
    });
  });

  it('no construye servicio si falta adapter inyectado aunque el runtime esté listo', () => {
    const result = createInternalVerifactuSubmissionExecutionService({
      repository,
      env: testAdapterEnv,
    });

    expect(result).toMatchObject({
      service: null,
      reason: 'VERIFACTU_ADAPTER_NOT_AVAILABLE',
      runtimeConfig: {
        mode: 'test',
        canSubmit: true,
      },
    });
  });

  it('construye el servicio interno cuando runtime, repositorio y adapter están disponibles', () => {
    const adapter = {
      submit: vi.fn(),
    };

    const result = createInternalVerifactuSubmissionExecutionService({
      repository,
      adapter,
      env: testAdapterEnv,
      now: () => '2026-07-09T10:00:00.000Z',
    });

    expect(result.service).toBeInstanceOf(VerifactuSubmissionExecutionService);
    expect(result.runtimeConfig).toMatchObject({
      mode: 'test',
      enabled: true,
      canSubmit: true,
      productionSafe: true,
    });
  });
});
