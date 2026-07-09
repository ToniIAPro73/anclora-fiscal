import { describe, expect, it } from 'vitest';
import {
  MockVerifactuAdapter,
  createIntegrityRecord,
  createVerifactuSubmissionDraft,
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

  it('models AEAT external testing as test mode', () => {
    expect(resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production' })).toEqual({
      mode: 'test',
      enabled: true,
      canSubmit: false,
      productionSafe: true,
    });
  });

  it('maps sandbox to test as a legacy alias', () => {
    expect(resolveVerifactuRuntimeConfig({ mode: 'sandbox', nodeEnv: 'test' })).toEqual({
      mode: 'test',
      enabled: true,
      canSubmit: false,
      productionSafe: true,
    });
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

  it('rejects test mode because MockVerifactuAdapter is not an AEAT adapter', async () => {
    const adapter = new MockVerifactuAdapter(resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'test' }));

    await expect(adapter.submit(record)).rejects.toThrow('VERIFACTU_NOT_ENABLED');
  });

  it('rejects sandbox alias because it resolves to test mode, not mock mode', async () => {
    const adapter = new MockVerifactuAdapter(resolveVerifactuRuntimeConfig({ mode: 'sandbox', nodeEnv: 'test' }));

    await expect(adapter.submit(record)).rejects.toThrow('VERIFACTU_NOT_ENABLED');
  });
});


describe('createVerifactuSubmissionDraft', () => {
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

  it('creates a blocked draft when VERI*FACTU is disabled', () => {
    const draft = createVerifactuSubmissionDraft(record, resolveVerifactuRuntimeConfig({}));

    expect(draft).toMatchObject({
      environment: 'mock',
      status: 'BLOCKED',
      responseRedacted: null,
      attemptCount: 0,
      canSubmit: false,
      blockReason: 'VERIFACTU_DISABLED',
    });

    expect(draft.payloadRedacted).toMatchObject({
      schemaVersion: 'anclora-verifactu-payload-redacted-v1',
      environment: 'mock',
      recordType: 'ALTA',
      documentNumber: 'F-2026-000001',
      documentHash: record.hash,
      chainHash: record.hash,
      previousHash: null,
      issuedAt: '2026-07-09T00:00:00.000Z',
      totalAmount: 10,
      taxAmount: 2.1,
      algorithm: 'SHA-256',
    });
  });

  it('creates a pending draft for mock mode', () => {
    const draft = createVerifactuSubmissionDraft(
      record,
      resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
    );

    expect(draft).toMatchObject({
      environment: 'mock',
      status: 'PENDING',
      responseRedacted: null,
      attemptCount: 0,
      canSubmit: true,
    });
    expect(draft.blockReason).toBeUndefined();
  });

  it('creates a pending draft for AEAT test mode without enabling submission yet', () => {
    const draft = createVerifactuSubmissionDraft(
      record,
      resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production' }),
    );

    expect(draft).toMatchObject({
      environment: 'test',
      status: 'PENDING',
      responseRedacted: null,
      attemptCount: 0,
      canSubmit: false,
    });
    expect(draft.blockReason).toBeUndefined();
  });

  it('blocks production until a real AEAT production adapter exists', () => {
    const draft = createVerifactuSubmissionDraft(
      record,
      resolveVerifactuRuntimeConfig({ mode: 'production', nodeEnv: 'production' }),
    );

    expect(draft).toMatchObject({
      environment: 'production',
      status: 'BLOCKED',
      responseRedacted: null,
      attemptCount: 0,
      canSubmit: false,
      blockReason: 'VERIFACTU_PRODUCTION_ADAPTER_NOT_CONFIGURED',
    });
  });
});
