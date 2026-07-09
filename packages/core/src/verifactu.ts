import { createHash } from 'node:crypto';

export interface VerifactuRecordInput { documentId: string; documentNumber: string; recordType: 'ALTA' | 'ANULACION'; issuedAt: string; totalAmount: number; taxAmount: number; previousHash?: string; }
export interface IntegrityRecord extends VerifactuRecordInput { canonicalPayload: string; hash: string; algorithm: 'SHA-256'; createdAt: string; }

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function createIntegrityRecord(input: VerifactuRecordInput, createdAt: string): IntegrityRecord {
  const canonicalPayload = canonicalize({ ...input, previousHash: input.previousHash ?? null });
  return { ...input, canonicalPayload, hash: createHash('sha256').update(canonicalPayload).digest('hex'), algorithm: 'SHA-256', createdAt };
}

export function verifyIntegrityChain(records: IntegrityRecord[]): boolean {
  return records.every((record, index) => {
    const expectedPrevious = index === 0 ? undefined : records[index - 1]?.hash;
    const rebuilt = createIntegrityRecord({ documentId: record.documentId, documentNumber: record.documentNumber, recordType: record.recordType, issuedAt: record.issuedAt, totalAmount: record.totalAmount, taxAmount: record.taxAmount, ...(record.previousHash ? { previousHash: record.previousHash } : {}) }, record.createdAt);
    return record.previousHash === expectedPrevious && rebuilt.hash === record.hash;
  });
}

/**
 * Runtime modes:
 * - disabled: no VERI*FACTU flow.
 * - mock: local simulator only; never allowed in production.
 * - test: real AEAT external testing environment once an AEAT adapter exists.
 * - production: real AEAT production environment once a production adapter exists.
 *
 * Legacy alias:
 * - sandbox is accepted as an alias for test to avoid breaking existing env values.
 */
export type VerifactuMode = 'disabled' | 'mock' | 'test' | 'production';

export interface VerifactuRuntimeConfig {
  mode: VerifactuMode;
  enabled: boolean;
  canSubmit: boolean;
  productionSafe: boolean;
}

export interface VerifactuSubmissionResult {
  status: 'ACCEPTED' | 'REJECTED';
  reference: string;
  message: string;
}

export interface VerifactuPort {
  submit(record: IntegrityRecord): Promise<VerifactuSubmissionResult>;
}


export type VerifactuSubmissionEnvironment = 'mock' | 'test' | 'production';

export type VerifactuSubmissionStatus =
  | 'PENDING'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'TECHNICAL_ERROR'
  | 'BLOCKED';

export interface VerifactuPayloadRedacted {
  schemaVersion: 'anclora-verifactu-payload-redacted-v1';
  environment: VerifactuSubmissionEnvironment;
  recordType: IntegrityRecord['recordType'];
  documentNumber: string;
  documentHash: string;
  chainHash: string;
  previousHash: string | null;
  issuedAt: string;
  totalAmount: number;
  taxAmount: number;
  algorithm: IntegrityRecord['algorithm'];
}

export interface VerifactuSubmissionDraft {
  environment: VerifactuSubmissionEnvironment;
  status: VerifactuSubmissionStatus;
  payloadRedacted: VerifactuPayloadRedacted;
  responseRedacted: null;
  attemptCount: 0;
  canSubmit: boolean;
  blockReason?: 'VERIFACTU_DISABLED' | 'VERIFACTU_PRODUCTION_ADAPTER_NOT_CONFIGURED';
}

function resolveSubmissionEnvironment(mode: VerifactuMode): VerifactuSubmissionEnvironment {
  if (mode === 'production') return 'production';
  if (mode === 'test') return 'test';
  return 'mock';
}

export function createVerifactuSubmissionDraft(
  record: IntegrityRecord,
  config: VerifactuRuntimeConfig,
): VerifactuSubmissionDraft {
  const environment = resolveSubmissionEnvironment(config.mode);

  const payloadRedacted: VerifactuPayloadRedacted = {
    schemaVersion: 'anclora-verifactu-payload-redacted-v1',
    environment,
    recordType: record.recordType,
    documentNumber: record.documentNumber,
    documentHash: record.hash,
    chainHash: record.hash,
    previousHash: record.previousHash ?? null,
    issuedAt: record.issuedAt,
    totalAmount: record.totalAmount,
    taxAmount: record.taxAmount,
    algorithm: record.algorithm,
  };

  if (!config.enabled || config.mode === 'disabled') {
    return {
      environment,
      status: 'BLOCKED',
      payloadRedacted,
      responseRedacted: null,
      attemptCount: 0,
      canSubmit: false,
      blockReason: 'VERIFACTU_DISABLED',
    };
  }

  if (config.mode === 'production' && !config.canSubmit) {
    return {
      environment,
      status: 'BLOCKED',
      payloadRedacted,
      responseRedacted: null,
      attemptCount: 0,
      canSubmit: false,
      blockReason: 'VERIFACTU_PRODUCTION_ADAPTER_NOT_CONFIGURED',
    };
  }

  return {
    environment,
    status: 'PENDING',
    payloadRedacted,
    responseRedacted: null,
    attemptCount: 0,
    canSubmit: config.canSubmit,
  };
}

function normalizeVerifactuMode(rawMode: string | undefined, legacyEnabled: boolean): VerifactuMode {
  const explicitMode = rawMode?.trim().toLowerCase();

  if (explicitMode === 'disabled') return 'disabled';
  if (explicitMode === 'mock') return 'mock';
  if (explicitMode === 'test' || explicitMode === 'sandbox') return 'test';
  if (explicitMode === 'production') return 'production';

  return legacyEnabled ? 'mock' : 'disabled';
}

export function resolveVerifactuRuntimeConfig(input: {
  mode?: string | undefined;
  enabled?: string | boolean | undefined;
  nodeEnv?: string | undefined;
}): VerifactuRuntimeConfig {
  const legacyEnabled = input.enabled === true || input.enabled === 'true';
  const mode = normalizeVerifactuMode(input.mode, legacyEnabled);
  const isProductionRuntime = input.nodeEnv === 'production';

  if (mode === 'mock' && isProductionRuntime) {
    throw new Error('VERIFACTU_MOCK_NOT_ALLOWED_IN_PRODUCTION');
  }

  if (mode === 'production') {
    return {
      mode,
      enabled: true,
      canSubmit: false,
      productionSafe: false,
    };
  }

  if (mode === 'test') {
    return {
      mode,
      enabled: true,
      canSubmit: false,
      productionSafe: true,
    };
  }

  if (mode === 'mock') {
    return {
      mode,
      enabled: true,
      canSubmit: true,
      productionSafe: !isProductionRuntime,
    };
  }

  return {
    mode: 'disabled',
    enabled: false,
    canSubmit: false,
    productionSafe: true,
  };
}

export class MockVerifactuAdapter implements VerifactuPort {
  constructor(private readonly config: VerifactuRuntimeConfig) {}

  async submit(record: IntegrityRecord): Promise<VerifactuSubmissionResult> {
    if (!this.config.enabled || !this.config.canSubmit) {
      throw new Error('VERIFACTU_NOT_ENABLED');
    }

    if (this.config.mode !== 'mock') {
      throw new Error('VERIFACTU_MOCK_ADAPTER_REQUIRES_MOCK_MODE');
    }

    if (!this.config.productionSafe) {
      throw new Error('VERIFACTU_MOCK_NOT_ALLOWED_IN_PRODUCTION');
    }

    return record.totalAmount < 0
      ? {
          status: 'REJECTED',
          reference: `mock-${record.hash.slice(0, 12)}`,
          message: 'Rechazo simulado para validar el flujo de revisión',
        }
      : {
          status: 'ACCEPTED',
          reference: `mock-${record.hash.slice(0, 12)}`,
          message: 'Aceptación simulada; no se ha contactado con la AEAT',
        };
  }
}
