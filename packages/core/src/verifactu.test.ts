import { describe, expect, it } from 'vitest';
import {
  MockVerifactuAdapter,
  createIntegrityRecord,
  resolveVerifactuRuntimeConfig,
} from './verifactu.js';

describe('resolveVerifactuRuntimeConfig', () => {
  it('keeps VERI*FACTU disabled by default', () => {
    expect(resolveVerifactuRuntimeConfig({})).toEqual({
      mode: 'disabled',
      enabled: false,
      canSubmit: false,
      productionSafe: true,
    });
  });

  it('maps legacy VERIFACTU_ENABLED=true to mock outside production', () => {
    expect(resolveVerifactuRuntimeConfig({ enabled: 'true', nodeEnv: 'test' })).toMatchObject({
      mode: 'mock',
      enabled: true,
      canSubmit: true,
      productionSafe: true,
    });
  });

  it('blocks mock mode in production', () => {
    expect(() => resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'production' })).toThrow(
      'VERIFACTU_MOCK_NOT_ALLOWED_IN_PRODUCTION',
    );
  });

  it('does not allow production submissions without a real adapter', () => {
    expect(resolveVerifactuRuntimeConfig({ mode: 'production', nodeEnv: 'production' })).toMatchObject({
      mode: 'production',
      enabled: true,
      canSubmit: false,
      productionSafe: false,
    });
  });
});

describe('MockVerifactuAdapter', () => {
  const record = createIntegrityRecord(
    {
      documentId: 'doc-1',
      documentNumber: 'F-2026-000001',
      recordType: 'ALTA',
      issuedAt: '2026-07-09T00:00:00.000Z',
      totalAmount: 10,
      taxAmount: 2.1,
    },
    '2026-07-09T00:00:00.000Z',
  );

  it('only submits in mock mode', async () => {
    const adapter = new MockVerifactuAdapter(resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }));

    await expect(adapter.submit(record)).resolves.toMatchObject({
      status: 'ACCEPTED',
      message: 'Aceptación simulada; no se ha contactado con la AEAT',
    });
  });

  it('rejects sandbox mode because it is not a real adapter', async () => {
    const adapter = new MockVerifactuAdapter(resolveVerifactuRuntimeConfig({ mode: 'sandbox', nodeEnv: 'test' }));

    await expect(adapter.submit(record)).rejects.toThrow('VERIFACTU_NOT_ENABLED');
  });
});
