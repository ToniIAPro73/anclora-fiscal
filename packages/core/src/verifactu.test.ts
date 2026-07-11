import { describe, expect, it, vi } from 'vitest';
import {
  AeatVerifactuAdapter,
  MockVerifactuAdapter,
  VerifactuSubmissionExecutionService,
  createIntegrityRecord,
  createVerifactuSubmissionAttempt,
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


describe('AeatVerifactuAdapter', () => {
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

  it('keeps AEAT test mode enabled but not submittable until an adapter is configured', () => {
    expect(resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production' })).toMatchObject({
      mode: 'test',
      enabled: true,
      canSubmit: false,
      productionSafe: true,
    });
  });

  it('allows AEAT test submissions when adapter configuration is explicitly present', () => {
    expect(resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production', adapterConfigured: true })).toMatchObject({
      mode: 'test',
      enabled: true,
      canSubmit: true,
      productionSafe: true,
    });
  });

  it('keeps production blocked unless adapter and production submission are explicitly enabled', () => {
    expect(resolveVerifactuRuntimeConfig({ mode: 'production', nodeEnv: 'production', adapterConfigured: true })).toMatchObject({
      mode: 'production',
      enabled: true,
      canSubmit: false,
      productionSafe: false,
    });

    expect(resolveVerifactuRuntimeConfig({
      mode: 'production',
      nodeEnv: 'production',
      adapterConfigured: true,
      productionSubmissionEnabled: true,
    })).toMatchObject({
      mode: 'production',
      enabled: true,
      canSubmit: true,
      productionSafe: true,
    });
  });

  it('submits through the injected AEAT test transport without using the mock adapter', async () => {
    const signer = {
      sign: vi.fn().mockResolvedValue({
        signedXml: '<SignedVerifactuRecord />',
        signatureDigest: 'digest-1',
        certificateFingerprint: 'cert-1',
      }),
    };

    const transport = {
      submit: vi.fn().mockResolvedValue({
        status: 'ACCEPTED',
        reference: 'aeat-test-ref-1',
        message: 'Aceptado en entorno de pruebas',
      }),
    };

    const adapter = new AeatVerifactuAdapter(
      resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production', adapterConfigured: true }),
      {
        environment: 'test',
        endpointUrl: 'https://aeat.test.example/verifactu',
        signer,
        transport,
      },
    );

    await expect(adapter.submit(record)).resolves.toEqual({
      status: 'ACCEPTED',
      reference: 'aeat-test-ref-1',
      message: 'Aceptado en entorno de pruebas',
    });

    expect(signer.sign).toHaveBeenCalledWith(record);
    expect(transport.submit).toHaveBeenCalledWith({
      environment: 'test',
      endpointUrl: 'https://aeat.test.example/verifactu',
      record,
      signedPayload: {
        signedXml: '<SignedVerifactuRecord />',
        signatureDigest: 'digest-1',
        certificateFingerprint: 'cert-1',
      },
    });
  });

  it('rejects AEAT adapter usage in mock mode', async () => {
    const adapter = new AeatVerifactuAdapter(
      resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
      {
        environment: 'test',
        endpointUrl: 'https://aeat.test.example/verifactu',
        signer: { sign: vi.fn() },
        transport: { submit: vi.fn() },
      },
    );

    await expect(adapter.submit(record)).rejects.toThrow('VERIFACTU_AEAT_ADAPTER_REQUIRES_AEAT_MODE');
  });

  it('rejects mismatched AEAT environment', async () => {
    const adapter = new AeatVerifactuAdapter(
      resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production', adapterConfigured: true }),
      {
        environment: 'production',
        endpointUrl: 'https://aeat.production.example/verifactu',
        signer: { sign: vi.fn() },
        transport: { submit: vi.fn() },
      },
    );

    await expect(adapter.submit(record)).rejects.toThrow('VERIFACTU_AEAT_ENVIRONMENT_MISMATCH');
  });
});


describe('createVerifactuSubmissionAttempt', () => {
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

  it('returns a redacted accepted response for a successful submission', async () => {
    const draft = createVerifactuSubmissionDraft(
      record,
      resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
    );

    const adapter = {
      submit: vi.fn().mockResolvedValue({
        status: 'ACCEPTED',
        reference: 'ref-accepted-1',
        message: 'Aceptado',
      }),
    };

    await expect(
      createVerifactuSubmissionAttempt(
        adapter,
        record,
        draft,
        '2026-07-09T10:00:00.000Z',
      ),
    ).resolves.toEqual({
      status: 'ACCEPTED',
      responseRedacted: {
        schemaVersion: 'anclora-verifactu-response-redacted-v1',
        environment: 'mock',
        status: 'ACCEPTED',
        reference: 'ref-accepted-1',
        message: 'Aceptado',
        submittedAt: '2026-07-09T10:00:00.000Z',
      },
      attemptCountIncrement: 1,
    });

    expect(adapter.submit).toHaveBeenCalledWith(record);
  });

  it('returns a redacted rejected response for a business rejection', async () => {
    const draft = createVerifactuSubmissionDraft(
      record,
      resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
    );

    const adapter = {
      submit: vi.fn().mockResolvedValue({
        status: 'REJECTED',
        reference: 'ref-rejected-1',
        message: 'Rechazado por validación',
      }),
    };

    await expect(
      createVerifactuSubmissionAttempt(
        adapter,
        record,
        draft,
        '2026-07-09T10:00:00.000Z',
      ),
    ).resolves.toMatchObject({
      status: 'REJECTED',
      responseRedacted: {
        environment: 'mock',
        status: 'REJECTED',
        reference: 'ref-rejected-1',
        message: 'Rechazado por validación',
      },
      attemptCountIncrement: 1,
    });
  });

  it('maps adapter failures to TECHNICAL_ERROR without throwing', async () => {
    const draft = createVerifactuSubmissionDraft(
      record,
      resolveVerifactuRuntimeConfig({ mode: 'mock', nodeEnv: 'test' }),
    );

    const adapter = {
      submit: vi.fn().mockRejectedValue(new Error('SOAP_TIMEOUT')),
    };

    await expect(
      createVerifactuSubmissionAttempt(
        adapter,
        record,
        draft,
        '2026-07-09T10:00:00.000Z',
      ),
    ).resolves.toEqual({
      status: 'TECHNICAL_ERROR',
      responseRedacted: {
        schemaVersion: 'anclora-verifactu-response-redacted-v1',
        environment: 'mock',
        status: 'TECHNICAL_ERROR',
        reference: null,
        message: 'SOAP_TIMEOUT',
        submittedAt: '2026-07-09T10:00:00.000Z',
      },
      attemptCountIncrement: 1,
    });
  });

  it('does not submit blocked drafts', async () => {
    const draft = createVerifactuSubmissionDraft(
      record,
      resolveVerifactuRuntimeConfig({}),
    );

    const adapter = {
      submit: vi.fn(),
    };

    await expect(
      createVerifactuSubmissionAttempt(
        adapter,
        record,
        draft,
        '2026-07-09T10:00:00.000Z',
      ),
    ).rejects.toThrow('VERIFACTU_SUBMISSION_NOT_PENDING');

    expect(adapter.submit).not.toHaveBeenCalled();
  });

  it('does not submit pending drafts that are not submittable yet', async () => {
    const draft = createVerifactuSubmissionDraft(
      record,
      resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production' }),
    );

    const adapter = {
      submit: vi.fn(),
    };

    await expect(
      createVerifactuSubmissionAttempt(
        adapter,
        record,
        draft,
        '2026-07-09T10:00:00.000Z',
      ),
    ).rejects.toThrow('VERIFACTU_SUBMISSION_NOT_SUBMITTABLE');

    expect(adapter.submit).not.toHaveBeenCalled();
  });
});


describe('VerifactuSubmissionExecutionService', () => {
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

  const draft = createVerifactuSubmissionDraft(
    record,
    resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production', adapterConfigured: true }),
  );

  const officialAeat = {
    schemaVersion: 'anclora-aeat-official-billing-record-redacted-v1' as const,
    legalEntityId: 'legal-entity-1',
    softwareInstallationNumber: 'LOCAL-TEST-001',
    idEmisorFactura: '12345678Z',
    numSerieFactura: record.documentNumber,
    fechaExpedicionFactura: '2026-07-09',
    tipoFactura: 'F1',
    huella: 'A'.repeat(64),
    huellaGeneratedAt: '2026-07-09T00:00:00.000Z',
    previousHuella: null,
    previousFiscalDocumentId: null,
  };

  function executableSubmission(overrides: Partial<{
    fiscalDocumentId: string;
    payloadRedacted: typeof draft.payloadRedacted;
    environment: typeof draft.environment;
  }> = {}) {
    const payloadRedacted = overrides.payloadRedacted ?? {
      ...draft.payloadRedacted,
      officialAeat,
    };

    return {
      id: 'submission-1',
      tenantId: 'tenant-1',
      fiscalDocumentId: overrides.fiscalDocumentId ?? 'doc-1',
      environment: overrides.environment ?? payloadRedacted.environment,
      status: 'PENDING' as const,
      payloadRedacted,
      attemptCount: '0',
    };
  }

  it('executes a pending submission and persists the accepted outcome', async () => {
    const repository = {
      findPendingById: vi.fn().mockResolvedValue(executableSubmission()),
      applyAttemptOutcome: vi.fn().mockResolvedValue({ id: 'submission-1' }),
    };

    const adapter = {
      submit: vi.fn().mockResolvedValue({
        status: 'ACCEPTED',
        reference: 'aeat-ref-1',
        message: 'Aceptado en entorno de pruebas',
      }),
    };

    const service = new VerifactuSubmissionExecutionService({
      repository,
      adapter,
      runtimeConfig: resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production', adapterConfigured: true }),
      now: () => '2026-07-09T10:00:00.000Z',
    });

    await expect(
      service.submitPending({ tenantId: 'tenant-1', submissionId: 'submission-1' }),
    ).resolves.toMatchObject({
      ok: true,
      outcome: {
        status: 'ACCEPTED',
        responseRedacted: {
          schemaVersion: 'anclora-verifactu-response-redacted-v1',
          environment: 'test',
          status: 'ACCEPTED',
          reference: 'aeat-ref-1',
          message: 'Aceptado en entorno de pruebas',
          submittedAt: '2026-07-09T10:00:00.000Z',
        },
        attemptCountIncrement: 1,
      },
    });

    expect(repository.findPendingById).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      submissionId: 'submission-1',
    });
    expect(adapter.submit).toHaveBeenCalledWith(record);
    expect(repository.applyAttemptOutcome).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      submissionId: 'submission-1',
      outcome: expect.objectContaining({
        status: 'ACCEPTED',
        attemptCountIncrement: 1,
      }),
    });
  });

  it('maps adapter failures to TECHNICAL_ERROR and still persists the outcome', async () => {
    const repository = {
      findPendingById: vi.fn().mockResolvedValue(executableSubmission()),
      applyAttemptOutcome: vi.fn().mockResolvedValue({ id: 'submission-1' }),
    };

    const adapter = {
      submit: vi.fn().mockRejectedValue(new Error('SOAP_TIMEOUT')),
    };

    const service = new VerifactuSubmissionExecutionService({
      repository,
      adapter,
      runtimeConfig: resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production', adapterConfigured: true }),
      now: () => '2026-07-09T10:00:00.000Z',
    });

    await expect(
      service.submitPending({ tenantId: 'tenant-1', submissionId: 'submission-1' }),
    ).resolves.toMatchObject({
      ok: true,
      outcome: {
        status: 'TECHNICAL_ERROR',
        responseRedacted: {
          environment: 'test',
          status: 'TECHNICAL_ERROR',
          reference: null,
          message: 'SOAP_TIMEOUT',
        },
        attemptCountIncrement: 1,
      },
    });

    expect(repository.applyAttemptOutcome).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      submissionId: 'submission-1',
      outcome: expect.objectContaining({
        status: 'TECHNICAL_ERROR',
        attemptCountIncrement: 1,
      }),
    });
  });

  it('does not execute when runtime is not submittable', async () => {
    const repository = {
      findPendingById: vi.fn(),
      applyAttemptOutcome: vi.fn(),
    };

    const adapter = {
      submit: vi.fn(),
    };

    const service = new VerifactuSubmissionExecutionService({
      repository,
      adapter,
      runtimeConfig: resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production' }),
    });

    await expect(
      service.submitPending({ tenantId: 'tenant-1', submissionId: 'submission-1' }),
    ).resolves.toEqual({
      ok: false,
      reason: 'VERIFACTU_RUNTIME_NOT_SUBMITTABLE',
    });

    expect(repository.findPendingById).not.toHaveBeenCalled();
    expect(adapter.submit).not.toHaveBeenCalled();
  });

  it('does not execute when the pending submission does not exist', async () => {
    const repository = {
      findPendingById: vi.fn().mockResolvedValue(null),
      applyAttemptOutcome: vi.fn(),
    };

    const adapter = {
      submit: vi.fn(),
    };

    const service = new VerifactuSubmissionExecutionService({
      repository,
      adapter,
      runtimeConfig: resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production', adapterConfigured: true }),
    });

    await expect(
      service.submitPending({ tenantId: 'tenant-1', submissionId: 'missing' }),
    ).resolves.toEqual({
      ok: false,
      reason: 'SUBMISSION_NOT_FOUND_OR_NOT_PENDING',
    });

    expect(adapter.submit).not.toHaveBeenCalled();
    expect(repository.applyAttemptOutcome).not.toHaveBeenCalled();
  });

  it('does not execute when the submission environment differs from runtime mode', async () => {
    const repository = {
      findPendingById: vi.fn().mockResolvedValue(executableSubmission()),
      applyAttemptOutcome: vi.fn(),
    };

    const adapter = {
      submit: vi.fn(),
    };

    const service = new VerifactuSubmissionExecutionService({
      repository,
      adapter,
      runtimeConfig: resolveVerifactuRuntimeConfig({ mode: 'production', nodeEnv: 'production', adapterConfigured: true, productionSubmissionEnabled: true }),
    });

    await expect(
      service.submitPending({ tenantId: 'tenant-1', submissionId: 'submission-1' }),
    ).resolves.toEqual({
      ok: false,
      reason: 'VERIFACTU_SUBMISSION_ENVIRONMENT_MISMATCH',
    });

    expect(adapter.submit).not.toHaveBeenCalled();
  });

  it('does not execute in AEAT mode when official AEAT metadata is missing', async () => {
    const payloadWithoutOfficialAeat = { ...draft.payloadRedacted };

    const repository = {
      findPendingById: vi.fn().mockResolvedValue(executableSubmission({
        payloadRedacted: payloadWithoutOfficialAeat,
      })),
      applyAttemptOutcome: vi.fn(),
    };

    const adapter = {
      submit: vi.fn(),
    };

    const service = new VerifactuSubmissionExecutionService({
      repository,
      adapter,
      runtimeConfig: resolveVerifactuRuntimeConfig({
        mode: 'test',
        nodeEnv: 'production',
        adapterConfigured: true,
      }),
    });

    await expect(
      service.submitPending({ tenantId: 'tenant-1', submissionId: 'submission-1' }),
    ).resolves.toEqual({
      ok: false,
      reason: 'VERIFACTU_OFFICIAL_AEAT_METADATA_MISSING',
    });

    expect(adapter.submit).not.toHaveBeenCalled();
    expect(repository.applyAttemptOutcome).not.toHaveBeenCalled();
  });

  it('does not execute when the redacted payload no longer matches the chain hash', async () => {
    const corruptedPayload = {
      ...draft.payloadRedacted,
      officialAeat,
      totalAmount: 999,
    };

    const repository = {
      findPendingById: vi.fn().mockResolvedValue(executableSubmission({ payloadRedacted: corruptedPayload })),
      applyAttemptOutcome: vi.fn(),
    };

    const adapter = {
      submit: vi.fn(),
    };

    const service = new VerifactuSubmissionExecutionService({
      repository,
      adapter,
      runtimeConfig: resolveVerifactuRuntimeConfig({ mode: 'test', nodeEnv: 'production', adapterConfigured: true }),
    });

    await expect(
      service.submitPending({ tenantId: 'tenant-1', submissionId: 'submission-1' }),
    ).resolves.toEqual({
      ok: false,
      reason: 'VERIFACTU_PAYLOAD_INTEGRITY_MISMATCH',
    });

    expect(adapter.submit).not.toHaveBeenCalled();
    expect(repository.applyAttemptOutcome).not.toHaveBeenCalled();
  });
});
